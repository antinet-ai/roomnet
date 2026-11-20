"use client";

import { Confidence } from "./DecisionCard";
import { SourceProblem } from "./PageTitle";
import { SeriesChart } from "./SeriesChart";
import { type Series, timeAgo } from "./useHome";

/** One line on where a sensor stands with anet: its reference being taken, or its latest decision. */
export function JudgeLine({ series, waiting }: { series: Series | null; waiting: string }) {
	const judge = series?.judge.value ?? null;
	if (judge === null) return <p className="text-sm text-gray-11">{waiting}</p>;
	if (judge.phase === "reference") {
		return (
			<p className="text-sm text-gray-11">
				Learning the usual pattern: {judge.held} of {judge.needed} readings
			</p>
		);
	}
	return (
		<div className="flex justify-between items-center">
			<p className="text-sm text-gray-11">
				{judge.label === "real" ? "The pattern changed" : "Pattern as usual"}
				{judge.attributes.urgency ? ` · ${judge.attributes.urgency} urgency` : ""}
			</p>
			<Confidence value={judge.confidence} />
		</div>
	);
}

/** A judged sensor: its reading, its chart and its standing with anet. */
export function SeriesPanel({ series }: { series: Series }) {
	const reading = series.reading.value;
	const values = series.history.map(([, value]) => value);
	const judge = series.judge.value;
	return (
		<div className="flex flex-col gap-4">
			<div className="flex justify-between items-baseline">
				<p className="text-sm font-medium text-gray-12">{series.label}</p>
				<p className="text-2xl font-medium tabular-nums text-gray-12">
					{reading ? `${reading.value.toFixed(1)} ${series.unit}` : "–"}
				</p>
			</div>
			<SeriesChart points={values} unit={series.unit} height={160} />
			<JudgeLine series={series} waiting="Waiting for the first reading." />
			{judge?.phase === "reference" && (
				<div className="overflow-hidden w-full h-1.5 rounded-full bg-gray-4">
					<div
						className="h-full rounded-full transition-all duration-200 bg-brand-9"
						style={{ width: `${(judge.held / judge.needed) * 100}%` }}
					/>
				</div>
			)}
			<SourceProblem
				error={series.reading.error}
				since={series.reading.value_time ? timeAgo(series.reading.value_time) : null}
			/>
			<SourceProblem error={series.judge.error} since={null} />
		</div>
	);
}
