"""The camera: one long-lived ffmpeg reads the RTSP stream at the camera's
own frame rate and writes JPEG frames to a pipe; every frame reaches the
screen as it arrives, and the detector takes the newest frame each time it
finishes the last one, so it runs as fast as anet answers and never queues
stale frames."""

from __future__ import annotations

import base64
import logging
import subprocess
import threading

from .anet_site import OBJECT_TASK, AnetSite
from .decisions import record_decision
from .problems import is_refused, is_unreachable
from .state import HomeState, now

log = logging.getLogger(__name__)

JPEG_START = b"\xff\xd8"
JPEG_END = b"\xff\xd9"
# How long the detector waits for a frame before checking whether to stop.
FRAME_WAIT_SECONDS = 1.0
RECONNECT_DELAY_SECONDS = 5.0
# A camera that keeps its connection open but sends no picture for this
# long is reconnected. It sends a frame about every 60 ms.
STALL_SECONDS = 10.0
STALL_CHECK_SECONDS = 1.0
READ_CHUNK_BYTES = 64 * 1024
# A frame of the low-quality stream is well under this; anything larger is
# a broken stream, not a frame.
MAX_FRAME_BYTES = 4 * 1024 * 1024
# The account failure is the camera's own; network failures use the words
# every device shares (problems.py).
ACCOUNT_REFUSED_WORDS = ("401", "Unauthorized")


def stream_ended_message(last_ffmpeg_error: str | None) -> str:
    """The plainest true sentence for why the stream stopped."""
    if last_ffmpeg_error:
        if is_unreachable(last_ffmpeg_error):
            return "The camera can't be reached on the network. Trying again every few seconds."
        if any(word in last_ffmpeg_error for word in ACCOUNT_REFUSED_WORDS):
            return "The camera turned down the camera account in devices.env."
        if is_refused(last_ffmpeg_error):
            return "The camera refused the connection on its video port."
    return "The camera stream ended."


def _jpeg_size(frame: bytes) -> tuple[int, int] | None:
    """Width and height from the first start-of-frame marker."""
    position = 2
    while position + 9 < len(frame):
        if frame[position] != 0xFF:
            return None
        marker = frame[position + 1]
        length = int.from_bytes(frame[position + 2 : position + 4], "big")
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(frame[position + 5 : position + 7], "big")
            width = int.from_bytes(frame[position + 7 : position + 9], "big")
            return width, height
        position += 2 + length
    return None


class Camera:
    def __init__(self, url: str, host: str, state: HomeState, site: AnetSite):
        self._url = url
        self._host = host
        self._state = state
        self._site = site
        self._stop = threading.Event()
        self._process: subprocess.Popen | None = None
        self._last_ffmpeg_error: str | None = None

    def start(self) -> None:
        threading.Thread(target=self._read_forever, name="camera", daemon=True).start()
        threading.Thread(target=self._detect_forever, name="detection", daemon=True).start()

    def stop(self) -> None:
        self._stop.set()
        process = self._process
        if process is not None:
            process.kill()

    def _read_forever(self) -> None:
        while not self._stop.is_set():
            try:
                stalled = self._read_stream()
                message = (
                    f"The camera sent no picture for {STALL_SECONDS:.0f} seconds."
                    if stalled
                    else stream_ended_message(self._last_ffmpeg_error)
                )
            except OSError as error:
                message = f"The camera stream could not be read: {error.strerror or error}."
            with self._state.lock:
                self._state.camera.failed(message)
            self._stop.wait(RECONNECT_DELAY_SECONDS)

    def _read_stream(self) -> bool:
        """Reads frames until the stream ends; returns whether it was ended
        here because the camera stopped sending."""
        command = [
            "ffmpeg", "-nostdin", "-loglevel", "error",
            "-rtsp_transport", "tcp", "-timeout", "5000000",
            # Input options: no read-ahead buffering, so each frame leaves
            # as soon as it is decoded. After -i they would go to the JPEG
            # encoder, which refuses them.
            "-fflags", "nobuffer", "-flags", "low_delay",
            # The camera's timestamps step back about 0.4 seconds every
            # second or two while its packets arrive evenly (specs/0075,
            # Context). Trusting them drops the frames of each step back,
            # so each packet is stamped at arrival and every decoded frame
            # is written.
            "-use_wallclock_as_timestamps", "1",
            "-i", self._url,
            # The encoder keeps the stream's own fine time base. On the
            # default, one tick a frame, two frames arriving within a tick
            # get the same time and ffmpeg reports an error for each.
            "-an", "-fps_mode", "passthrough", "-enc_time_base", "demux",
            # The camera sends limited-range YUV, which the JPEG encoder
            # refuses unless converted to its full-range format.
            "-pix_fmt", "yuvj420p",
            "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "5", "-",
        ]
        self._last_ffmpeg_error = None
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self._process = process
        assert process.stdout is not None
        stalled = threading.Event()
        stream_over = threading.Event()
        threading.Thread(
            target=self._log_errors, args=(process,), name="camera-errors", daemon=True
        ).start()
        threading.Thread(
            target=self._end_when_stalled,
            args=(process, stalled, stream_over),
            name="camera-stall",
            daemon=True,
        ).start()
        buffer = b""
        try:
            while not self._stop.is_set():
                chunk = process.stdout.read1(READ_CHUNK_BYTES)
                if not chunk:
                    break
                buffer += chunk
                while True:
                    start = buffer.find(JPEG_START)
                    end = buffer.find(JPEG_END, start + 2) if start >= 0 else -1
                    if start < 0 or end < 0:
                        break
                    frame = buffer[start : end + 2]
                    buffer = buffer[end + 2 :]
                    self._keep(frame)
                if len(buffer) > MAX_FRAME_BYTES:
                    buffer = b""
        finally:
            stream_over.set()
            process.kill()
            process.wait()
        return stalled.is_set()

    def _log_errors(self, process: subprocess.Popen) -> None:
        """Reads ffmpeg's errors as they come. Left unread they fill the
        pipe, and ffmpeg then blocks on its next error and sends no more
        frames while still running."""
        assert process.stderr is not None
        for line in process.stderr:
            # ffmpeg repeats the URL, credentials included, in its errors.
            text = line.decode(errors="replace").replace(self._url, f"rtsp://{self._host}").strip()[:500]
            self._last_ffmpeg_error = text
            log.warning("ffmpeg: %s", text)

    def _end_when_stalled(
        self, process: subprocess.Popen, stalled: threading.Event, stream_over: threading.Event
    ) -> None:
        with self._state.lock:
            last_sequence = self._state.frame_sequence
        quiet_seconds = 0.0
        while not stream_over.wait(STALL_CHECK_SECONDS):
            with self._state.lock:
                sequence = self._state.frame_sequence
            if sequence != last_sequence:
                last_sequence = sequence
                quiet_seconds = 0.0
                continue
            quiet_seconds += STALL_CHECK_SECONDS
            if quiet_seconds >= STALL_SECONDS:
                stalled.set()
                process.kill()
                return

    def _keep(self, frame: bytes) -> None:
        size = _jpeg_size(frame)
        with self._state.lock:
            self._state.frame_jpeg = frame
            self._state.frame_time = now()
            self._state.frame_size = size
            self._state.frame_sequence += 1
            self._state.camera.succeeded({"width": size[0], "height": size[1]} if size else None)
        self._state.announce()

    def _detect_forever(self) -> None:
        detected_sequence = 0
        while not self._stop.is_set():
            with self._state.lock:
                seen = (self._state.frame_sequence, self._state.detection_sequence)
            if seen[0] == detected_sequence:
                seen = self._state.wait_for_change(seen, FRAME_WAIT_SECONDS)
            with self._state.lock:
                frame = self._state.frame_jpeg
                frame_time = self._state.frame_time
                sequence = self._state.frame_sequence
            if frame is None or sequence == detected_sequence:
                continue
            detected_sequence = sequence
            self._detect(frame, frame_time)

    def _detect(self, frame: bytes, frame_time) -> None:
        case = {
            "camera": self._host,
            "frame_time": frame_time.isoformat(),
            "image": base64.b64encode(frame).decode(),
        }
        try:
            decision = self._site.decide(OBJECT_TASK, case)
        except Exception as error:  # noqa: BLE001 - shown to the person, never hidden
            with self._state.lock:
                self._state.detection.failed(f"Object detection failed: {error}")
            return
        with self._state.lock:
            frame_size = self._state.frame_size
            self._state.detection_sequence += 1
            self._state.detection.succeeded(
                {
                    "sequence": self._state.detection_sequence,
                    "decision_id": decision.id,
                    "label": decision.label,
                    "confidence": decision.confidence,
                    "attributes": decision.attributes or {},
                    "frame_time": frame_time.isoformat(),
                    "frame_size": frame_size,
                }
            )
        record_decision(
            self._state,
            self._site,
            decision,
            source="camera",
            frame=frame,
            detail={"frame_size": frame_size},
        )
        self._state.announce()
