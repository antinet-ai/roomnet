"use client";

import { faBolt, faDroplet, faTemperatureHalf, faWaveSquare, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { TickProgress } from "./controls";
import { Confidence } from "./DecisionCard";
import { CardTop, moment, Reading } from "./HomeParts";
import { SourceProblem } from "./PageTitle";
import { SeriesChart } from "./SeriesChart";
import { type Series, timeAgo } from "./useHome";

const UNIT_ICONS: Record<string, IconDefinition> = { W: faBolt, "°C": faTemperatureHalf, "%": faDroplet };

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

/** Where the sensor stands, in one word; colour only when its pattern changed. */
function Standing({ series }: { series: Series }) {
	const judge = series.judge.value;
	const changed = judge?.phase === "judging" && judge.label === "real";
	const word = !judge ? "Waiting" : judge.phase === "reference" ? "Learning" : changed ? "Changed" : "As usual";
	return (
		<span className="flex gap-1.5 items-center px-2.5 h-6 text-xs rounded-full bg-gray-3 text-gray-11">
			{changed && <span className="rounded-full size-1.5 bg-red-500" />}
			{word}
		</span>
	);
}

/** A judged sensor: its reading, its chart and its standing with anet. */
export function SeriesPanel({ series }: { series: Series }) {
	const reading = series.reading.value;
	const values = series.history.map(([, value]) => value);
	const judge = series.judge.value;

	return (
		<div className="flex flex-col gap-5 h-full">
			<CardTop icon={UNIT_ICONS[series.unit] ?? faWaveSquare} label={series.label}>
				<Standing series={series} />
			</CardTop>
			<Reading
				value={reading ? reading.value.toFixed(1) : "–"}
				unit={series.unit}
				detail={series.reading.value_time ? `Updated ${moment(series.reading.value_time)}` : undefined}
			/>
			<SeriesChart points={values} unit={series.unit} height={140} />
			<div className="flex flex-col gap-2 mt-auto">
				{judge?.phase === "reference" ? (
					<>
						<TickProgress fraction={judge.held / judge.needed} label="Learning the usual pattern" />
						<p className="text-[13px] tabular-nums text-gray-10">
							Learning its usual pattern · {judge.held} of {judge.needed} readings
						</p>
					</>
				) : (
					<JudgeLine series={series} waiting="Waiting for the first reading." />
				)}
			</div>
			<SourceProblem error={series.reading.error} since={series.reading.value_time ? timeAgo(series.reading.value_time) : null} />
			<SourceProblem error={series.judge.error} since={null} />
		</div>
	);
}
