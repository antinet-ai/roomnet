import clsx from "clsx";

interface SpinnerProps {
	className?: string;
	/** Rendered size in px. Omit to size with `className` instead. */
	size?: number;
	/** Stroke width in SVG user units (the viewBox is 24x24). */
	thickness?: number;
}

/**
 * The app's single loading indicator: a hairline track with a rotating arc.
 * Inherits `currentColor`, so tint it with the text color of the parent.
 */
export const Spinner = ({ className, size, thickness = 2 }: SpinnerProps) => {
	const radius = 12 - thickness / 2;
	const circumference = 2 * Math.PI * radius;

	return (
		<svg
			className={clsx("shrink-0 animate-spin", className)}
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			width={size}
			height={size}
			fill="none"
			aria-hidden="true"
		>
			<circle
				cx="12"
				cy="12"
				r={radius}
				stroke="currentColor"
				strokeWidth={thickness}
				strokeOpacity={0.15}
			/>
			<circle
				cx="12"
				cy="12"
				r={radius}
				stroke="currentColor"
				strokeWidth={thickness}
				strokeLinecap="round"
				strokeDasharray={`${circumference * 0.28} ${circumference}`}
			/>
		</svg>
	);
};
