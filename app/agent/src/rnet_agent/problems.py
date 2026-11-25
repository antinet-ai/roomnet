"""Device failures in words a person can act on. The device libraries report
network failures as Rust debug text (`Http(reqwest::Error { ... })`), which
means nothing on the screen; the raw text still goes to the log."""

from __future__ import annotations

import logging

log = logging.getLogger(__name__)

UNREACHABLE_WORDS = ("Host is down", "No route to host", "Network is unreachable", "timed out", "TimedOut")
REFUSED_WORDS = ("Connection refused", "ConnectionRefused")


def is_unreachable(raw: str) -> bool:
    return any(word in raw for word in UNREACHABLE_WORDS)


def is_refused(raw: str) -> bool:
    return any(word in raw for word in REFUSED_WORDS)


def device_problem(what: str, error: object, failed_to: str = "could not be read") -> str:
    """One plain sentence for a device failure, naming the network when the network is the cause."""
    raw = str(error)
    log.warning("%s %s: %s", what, failed_to, raw)
    if is_unreachable(raw):
        return f"The {what} can't be reached on the network."
    if is_refused(raw):
        return f"The {what} refused the connection."
    return f"The {what} {failed_to}: {raw}"
