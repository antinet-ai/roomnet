"use client";

import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { type SourceState, timeAgo } from "./useHome";

export function since<T>(source: SourceState<T> | null | undefined): string | null {
	return source?.value_time ? timeAgo(source.value_time) : null;
}

export function kwh(wattHours: number): string {
	return `${(wattHours / 1000).toFixed(2)} kWh`;
}

/** When something happened, in the words a person would use: "4 min ago", "at 01:56", "yesterday at 01:56". */
export function moment(iso: string): string {
	const then = new Date(iso);
	if (Date.now() - then.getTime() < 60 * 60 * 1000) return timeAgo(iso);
	const time = then.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	if (then.toDateString() === new Date().toDateString()) return `at ${time}`;
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	if (then.toDateString() === yesterday.toDateString()) return `yesterday at ${time}`;
	return `${then.toLocaleDateString([], { day: "numeric", month: "short" })} at ${time}`;
}

/** The top line of every overview card: what it is, and on the right the one thing you can do to it. */
export function CardTop({ icon, label, children }: { icon: IconDefinition; label: string; children?: React.ReactNode }) {
	return (
		<div className="flex gap-3 justify-between items-center min-h-6">
			<p className="flex gap-2 items-center min-w-0 text-sm text-gray-11">
				<FontAwesomeIcon icon={icon} className="size-[13px] shrink-0 text-gray-10" />
				<span className="truncate">{label}</span>
			</p>
			{children}
		</div>
	);
}

/** A value the way the overview shows every value: the number large, what it means beside it, one line of context under it. */
export function Reading({ value, unit, detail }: { value: string; unit?: string; detail?: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1 min-w-0">
			<p className="flex gap-2 items-baseline min-w-0">
				<span className="text-[28px] font-medium tracking-tight leading-tight tabular-nums shrink-0 text-gray-12">{value}</span>
				{unit && <span className="text-sm truncate text-gray-10">{unit}</span>}
			</p>
			{detail && <div className="text-[13px] truncate text-gray-10">{detail}</div>}
		</div>
	);
}
