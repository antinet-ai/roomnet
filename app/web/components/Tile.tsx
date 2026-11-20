"use client";

import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";

/**
 * One device at a glance. An active device (on, open, sounding) sits on the
 * raised surface; an idle one recedes. `glow` is the device's own colour,
 * used only where the colour is the device's state (the bulb's light).
 */
export function Tile({
	icon,
	name,
	state,
	detail,
	active,
	problem,
	glow,
	onOpen,
}: {
	icon: IconDefinition;
	name: string;
	state: string;
	detail?: string;
	active: boolean;
	problem?: boolean;
	glow?: string;
	onOpen: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			className={clsx(
				"flex flex-col gap-5 justify-between p-4 text-left rounded-[22px] border transition-all duration-200 active:scale-[0.97] min-h-[132px]",
				active ? "bg-gray-1 border-gray-3 shadow-sm" : "bg-gray-3/60 border-transparent hover:bg-gray-3",
			)}
		>
			<div className="flex justify-between items-start">
				<span
					className={clsx(
						"flex justify-center items-center rounded-full transition-colors duration-200 size-10",
						!glow && (active ? "bg-gray-12 text-gray-1" : "bg-gray-4 text-gray-11"),
					)}
					style={glow ? { background: glow, color: "rgba(0,0,0,0.65)" } : undefined}
				>
					<FontAwesomeIcon icon={icon} className="size-[16px]" />
				</span>
				{problem && <span className="mt-1 rounded-full size-2 bg-red-500" aria-label="Needs attention" />}
			</div>
			<div className="flex flex-col gap-0.5 min-w-0">
				<p className="text-[13px] truncate text-gray-10">{name}</p>
				<p className="text-[17px] font-medium tracking-tight leading-tight truncate text-gray-12">{state}</p>
				{detail && <p className="text-xs truncate text-gray-10">{detail}</p>}
			</div>
		</button>
	);
}
