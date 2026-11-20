"use client";

const WIDTH = 600;
const HEIGHT = 160;

/** One sensor's readings as one line on a hairline grid, newest on the right. */
export function SeriesChart({ points, unit, height = HEIGHT }: { points: number[]; unit: string; height?: number }) {
	if (points.length < 2) {
		return <div className="w-full rounded-xl bg-gray-3" style={{ height }} />;
	}
	const highest = Math.max(...points);
	const lowest = Math.min(...points);
	const span = highest - lowest || 1;
	const top = highest + span * 0.1;
	// Power never goes below zero; a temperature may.
	const bottom = lowest >= 0 ? Math.max(0, lowest - span * 0.1) : lowest - span * 0.1;
	const path = points
		.map((watts, index) => {
			const x = (index / (points.length - 1)) * WIDTH;
			const y = HEIGHT - ((watts - bottom) / (top - bottom || 1)) * HEIGHT;
			return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
		})
		.join(" ");
	return (
		<div className="relative w-full" style={{ height }}>
			<svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="w-full h-full">
				{[0.25, 0.5, 0.75].map((fraction) => (
					<line
						key={fraction}
						x1={0}
						x2={WIDTH}
						y1={HEIGHT * fraction}
						y2={HEIGHT * fraction}
						stroke="var(--gray-4)"
						strokeWidth={1}
						vectorEffect="non-scaling-stroke"
					/>
				))}
				<path d={path} fill="none" stroke="var(--brand-9)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
			</svg>
			<span className="absolute top-0 right-0 text-[11px] tabular-nums text-gray-10">{top.toFixed(1)} {unit}</span>
			<span className="absolute right-0 bottom-0 text-[11px] tabular-nums text-gray-10">{bottom.toFixed(1)} {unit}</span>
		</div>
	);
}
