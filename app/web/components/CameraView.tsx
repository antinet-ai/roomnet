"use client";

import { percent } from "./useHome";

export type DetectedBox = {
	label: string;
	score: number;
	left: number;
	top: number;
	width: number;
	height: number;
};

/** The task's `box_N` attributes, mapped from the detector's letterboxed
 * square back to fractions of the frame. */
export function boxesFrom(
	attributes: Record<string, string>,
	frameSize: [number, number] | null,
): DetectedBox[] {
	if (!frameSize) return [];
	const side = Number(attributes.input_side);
	const [width, height] = frameSize;
	const scale = Math.min(side / width, side / height);
	const padLeft = Math.floor((side - Math.round(width * scale)) / 2);
	const padTop = Math.floor((side - Math.round(height * scale)) / 2);
	return Object.entries(attributes)
		.filter(([name]) => name.startsWith("box_"))
		.sort(([left], [right]) => Number(left.slice(4)) - Number(right.slice(4)))
		.map(([, value]) => {
			const [label, score, x, y, w, h] = value.split(" ");
			return {
				label,
				score: Number(score),
				left: (Number(x) - padLeft) / scale / width,
				top: (Number(y) - padTop) / scale / height,
				width: Number(w) / scale / width,
				height: Number(h) / scale / height,
			};
		});
}

export function BoxOverlay({ boxes }: { boxes: DetectedBox[] }) {
	return (
		<>
			{boxes.map((box, index) => (
				<div
					key={`${box.label}-${index}`}
					className="absolute rounded-md border-2 border-brand-9 pointer-events-none"
					style={{
						left: `${box.left * 100}%`,
						top: `${box.top * 100}%`,
						width: `${box.width * 100}%`,
						height: `${box.height * 100}%`,
					}}
				>
					<span className="absolute left-0 -top-6 px-1.5 text-xs font-medium text-white whitespace-nowrap rounded bg-brand-9 tabular-nums">
						{box.label.replaceAll("-", " ")} {percent(box.score)}
					</span>
				</div>
			))}
		</>
	);
}

export function CameraView({
	streamUrl,
	boxes,
}: {
	streamUrl: string | null;
	boxes: DetectedBox[];
}) {
	return (
		// The frame keeps its 16:9 box so detection boxes stay on target, and sits
		// centred when the card is stretched taller than the picture.
		<div className="flex overflow-hidden items-center w-full h-full rounded-xl bg-gray-3">
			<div className="relative w-full aspect-video">
				{streamUrl ? (
					// An MJPEG stream from the local agent; next/image cannot show one.
					// eslint-disable-next-line @next/next/no-img-element
					<img src={streamUrl} alt="Live camera" className="object-contain absolute inset-0 w-full h-full" />
				) : null}
				<div className="absolute inset-0">
					<BoxOverlay boxes={boxes} />
				</div>
			</div>
		</div>
	);
}
