"use client";

import { type TimelineEntry, useHome } from "./useHome";

function clock(iso: string): string {
	return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** What happened in the home, newest first, from every source (specs/0078, MORE-14). */
export function Timeline({ limit }: { limit?: number }) {
	const { state } = useHome();
	const series = state?.series ?? {};
	const entries: TimelineEntry[] = (state?.timeline ?? []).slice(0, limit);
	// A sensor's entries name it by its label, not its anet sensor name.
	const text = (entry: TimelineEntry) =>
		series[entry.source] ? entry.text.replace(entry.source, series[entry.source].label) : entry.text;

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-lg font-medium text-gray-12">Activity</h2>
			{entries.length === 0 ? (
				<p className="text-[15px] text-gray-10">Nothing has happened yet.</p>
			) : (
				<ol className="flex flex-col">
					{entries.map((entry, index) => (
						<li key={entry.key} className="flex gap-4">
							<span className="pt-3 w-12 text-xs text-right tabular-nums shrink-0 text-gray-10">{clock(entry.time)}</span>
							<span className="flex relative flex-col items-center shrink-0">
								<span className="mt-[17px] rounded-full size-2 bg-gray-8" />
								{index < entries.length - 1 && <span className="flex-1 w-px bg-gray-4" />}
							</span>
							<p className="py-2.5 text-sm text-gray-12">{text(entry)}</p>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
