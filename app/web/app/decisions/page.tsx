"use client";

import { faCamera, faChartLine } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import { useState } from "react";
import { Segmented } from "@/components/controls";
import { Confidence, DecisionCard, headline } from "@/components/DecisionCard";
import { moment, Reading } from "@/components/HomeParts";
import { PageTitle } from "@/components/PageTitle";
import { type DecisionEntry, useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

type Filter = "waiting" | "all";

function isToday(iso: string): boolean {
	return new Date(iso).toDateString() === new Date().toDateString();
}

function needsPerson(decision: DecisionEntry): boolean {
	return decision.to_person && decision.action === null;
}

export default function Decisions() {
	const { decisions, state } = useHome();
	const [filter, setFilter] = useState<Filter>("waiting");
	const [chosenId, setChosenId] = useState<string | null>(null);
	const all = decisions ?? [];
	const waiting = all.filter(needsPerson);
	const shown = filter === "waiting" ? waiting : all;
	const chosen = shown.find((decision) => decision.id === chosenId) ?? shown[0] ?? null;
	const answered = all.filter((decision) => decision.action !== null).length;
	const sensorLabel = (decision: DecisionEntry) => state?.series[decision.source]?.label ?? decision.source;

	const counts = [
		{ label: "Needs you", value: waiting.length, unit: waiting.length === 1 ? "decision" : "decisions" },
		{ label: "Decided today", value: all.filter((decision) => isToday(decision.time)).length, unit: "decisions" },
		{ label: "Answered by you", value: answered, unit: answered === 1 ? "answer" : "answers" },
	];

	return (
		<>
			<PageTitle title="Decisions">
				<div className="w-56">
					<Segmented
						label="Show"
						value={filter}
						onChange={setFilter}
						options={[
							{ value: "waiting", label: waiting.length > 0 ? `Needs you · ${waiting.length}` : "Needs you" },
							{ value: "all", label: "All" },
						]}
					/>
				</div>
			</PageTitle>
			<Card className="grid grid-cols-1 p-0 sm:grid-cols-3">
				{counts.map((count) => (
					<div key={count.label} className="flex flex-col gap-3 p-4 min-w-0 border-t border-gray-3 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 sm:p-5">
						<p className="text-sm truncate text-gray-11">{count.label}</p>
						<Reading value={String(count.value)} unit={count.unit} />
					</div>
				))}
			</Card>
			{shown.length === 0 ? (
				<Card className="flex flex-col gap-1 justify-center items-center py-16 text-center">
					<p className="text-[15px] font-medium text-gray-12">{filter === "waiting" ? "Nothing needs you" : "No decisions yet"}</p>
					<p className="text-sm text-gray-10">
						{filter === "waiting" ? "When a model is unsure, it asks you here." : "Decisions appear as the camera and sensors are judged."}
					</p>
				</Card>
			) : (
				<div className="grid grid-cols-1 gap-5 items-start xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
					<Card className="overflow-hidden p-0">
						<ol className="flex flex-col">
							{shown.map((decision) => (
								<li key={decision.id} className="border-t border-gray-3 first:border-t-0">
									<button
										type="button"
										onClick={() => setChosenId(decision.id)}
										aria-current={chosen?.id === decision.id}
										className={clsx(
											"flex gap-3 items-center px-4 py-3.5 w-full text-left transition-colors duration-150",
											chosen?.id === decision.id ? "bg-gray-3" : "hover:bg-gray-2",
										)}
									>
										<FontAwesomeIcon
											icon={decision.source === "camera" ? faCamera : faChartLine}
											className="size-[13px] shrink-0 text-gray-10"
										/>
										<span className="flex flex-col flex-1 min-w-0">
											<span className="text-sm font-medium truncate text-gray-12">{headline(decision, sensorLabel(decision))}</span>
											<span className="text-[13px] truncate text-gray-10">
												{decision.source === "camera" ? "Camera" : sensorLabel(decision)} · {moment(decision.time)}
												{decision.action ? ` · ${decision.action === "confirm" ? "Confirmed" : "Dismissed"}` : ""}
											</span>
										</span>
										{needsPerson(decision) && <span className="rounded-full size-2 shrink-0 bg-gray-12" aria-label="Needs you" />}
										<Confidence value={decision.confidence} threshold={decision.threshold} />
									</button>
								</li>
							))}
						</ol>
					</Card>
					{chosen && (
						<div className="xl:sticky xl:top-0">
							<DecisionCard key={chosen.id} decision={chosen} />
						</div>
					)}
				</div>
			)}
		</>
	);
}
