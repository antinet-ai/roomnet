"use client";

import { faCalendarDay } from "@fortawesome/free-solid-svg-icons";
import { Card } from "@/ui/Card";
import { CardTop, moment, Reading } from "./HomeParts";
import { type TimelineEntry, useHome } from "./useHome";

// The agent keeps this many timeline entries (state.py TIMELINE_LENGTH); a
// full list whose oldest entry is from today means today's counts are a floor.
const TIMELINE_KEPT = 200;

const KINDS: { name: string; matches: (entry: TimelineEntry) => boolean }[] = [
	{ name: "Seen on camera", matches: (entry) => entry.source === "camera" },
	{ name: "Motion", matches: (entry) => entry.source === "motion" },
	{ name: "Door", matches: (entry) => entry.source === "door" },
	{ name: "Your actions", matches: (entry) => entry.source === "you" },
	{ name: "Sensor changes", matches: (entry) => !["camera", "motion", "door", "you"].includes(entry.source) },
];

function clock(iso: string): string {
	return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function isToday(iso: string): boolean {
	return new Date(iso).toDateString() === new Date().toDateString();
}

/** The day at a glance: how much happened, when, and of what kind, instead of a raw event log. */
export function Today() {
	const { state } = useHome();
	const kept = state?.timeline ?? [];
	const today = kept.filter((entry) => isToday(entry.time));
	const countsAreFloor = kept.length >= TIMELINE_KEPT && today.length === kept.length;
	const suffix = countsAreFloor ? "+" : "";

	const perHour = Array.from({ length: 24 }, () => 0);
	for (const entry of today) perHour[new Date(entry.time).getHours()] += 1;
	const busiestHour = Math.max(1, ...perHour);
	const currentHour = new Date().getHours();

	const kinds = KINDS.map((kind) => {
		const entries = today.filter(kind.matches);
		return { name: kind.name, count: entries.length, last: entries[0]?.time ?? null };
	})
		.filter((kind) => kind.count > 0)
		.sort((left, right) => right.count - left.count);

	return (
		<Card className="flex flex-col flex-1 gap-6">
			<div className="flex flex-col gap-3">
				<CardTop icon={faCalendarDay} label="Today" />
				<Reading
					value={`${today.length}${suffix}`}
					unit={today.length === 1 ? "event" : "events"}
					detail={today[0] ? `Last one ${moment(today[0].time)}` : "Nothing has happened yet"}
				/>
			</div>
			<div className="flex flex-col flex-1 gap-2 justify-end">
				<div className="flex gap-[3px] items-end h-28">
					{perHour.map((count, hour) => (
						<div
							key={hour}
							title={`${String(hour).padStart(2, "0")}:00 · ${count} ${count === 1 ? "event" : "events"}`}
							className={
								hour > currentHour
									? "flex-1 rounded-sm bg-gray-3"
									: hour === currentHour
										? "flex-1 rounded-sm bg-gray-12"
										: count > 0
											? "flex-1 rounded-sm bg-gray-7"
											: "flex-1 rounded-sm bg-gray-4"
							}
							style={{ height: count > 0 ? `${Math.max(8, (count / busiestHour) * 100)}%` : "3px" }}
						/>
					))}
				</div>
				<div className="flex justify-between text-[11px] tabular-nums text-gray-10">
					<span>00</span>
					<span>06</span>
					<span>12</span>
					<span>18</span>
					<span>24</span>
				</div>
			</div>
			{kinds.length > 0 && (
				<dl className="flex flex-col">
					{kinds.map((kind) => (
						<div key={kind.name} className="flex gap-4 justify-between items-baseline py-2.5 border-t border-gray-3">
							<dt className="text-sm text-gray-11">{kind.name}</dt>
							<dd className="text-sm tabular-nums text-gray-12">
								{kind.count}
								{suffix}
								{kind.last && <span className="ml-2 text-gray-10">{clock(kind.last)}</span>}
							</dd>
						</div>
					))}
				</dl>
			)}
		</Card>
	);
}
