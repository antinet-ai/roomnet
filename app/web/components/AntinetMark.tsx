import { useId } from "react";

// The Antinet small mark (antissets/svg/antinet-logo-small-*.svg), drawn in
// the current text colour so it follows the theme.
export function AntinetMark({ className }: { className?: string }) {
	const maskId = useId();
	return (
		<svg viewBox="-100 -100 200 200" className={className} aria-hidden="true">
			<mask id={maskId} maskUnits="userSpaceOnUse" x="-100" y="-100" width="200" height="200">
				<circle r="100" fill="#fff" />
				<polyline
					transform="translate(0,2) rotate(-3.5)"
					points="-110,-22 58,-22 40.6,29 -64.9,29 -55,0 110,0"
					fill="none"
					stroke="#000"
					strokeWidth="18"
					strokeMiterlimit="10"
				/>
			</mask>
			<circle r="100" fill="currentColor" mask={`url(#${maskId})`} />
		</svg>
	);
}
