"use client";

import Link from "next/link";
import { Accessories } from "@/components/Accessories";
import { Automations } from "@/components/Automations";
import { boxesFrom, CameraView } from "@/components/CameraView";
import { Confidence, DecisionCard } from "@/components/DecisionCard";
import { SourceProblem } from "@/components/PageTitle";
import { Timeline } from "@/components/Timeline";
import { useDetections } from "@/components/useDetections";
import { type HomeState, timeAgo, useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

/** One calm line on the home: what needs a person first, then the state worth knowing. */
function summary(state: HomeState | null, waiting: number): string {
	if (!state) return "Connecting to the home…";
	const parts: string[] = [];
	if (waiting > 0) parts.push(`${waiting} ${waiting === 1 ? "decision needs" : "decisions need"} you`);
	if (state.hub.value?.in_alarm) parts.push("the siren is sounding");
	if (state.door.value?.open) parts.push("the door is open");
	if (state.climate.value) parts.push(`${state.climate.value.temperature.toFixed(1)}° inside`);
	if (parts.length === 0) return "All quiet.";
	const sentence = parts.join(", ");
	return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`;
}

export default function Overview() {
	const { state, decisions, agentError } = useHome();
	const live = useDetections();
	const detection = live.detection ?? state?.detection.value ?? null;
	const waiting = (decisions ?? []).filter((item) => item.to_person && item.action === null);

	return (
		<>
			<header className="flex flex-col gap-1">
				<h1 className="text-[32px] font-medium tracking-tight leading-tight text-gray-12">Home</h1>
				<p className="text-[15px] text-gray-11">{agentError ?? summary(state, waiting.length)}</p>
			</header>
			<div className="grid grid-cols-1 gap-6 xl:grid-cols-[3fr_2fr]">
				<Card className="flex flex-col gap-3 p-3">
					<CameraView
						streamUrl={state?.camera.value_time ? "/api/camera/stream" : null}
						boxes={detection ? boxesFrom(detection.attributes, detection.frame_size) : []}
					/>
					<div className="flex justify-between items-center px-2 pb-1">
						<p className="text-sm text-gray-11">
							{detection
								? detection.label === "nothing"
									? "Nothing in view"
									: (detection.attributes.objects ?? detection.label).replaceAll(":", " ").replaceAll(",", ", ").replaceAll("-", " ")
								: "Waiting for the first frame"}
						</p>
						{detection && <Confidence value={detection.confidence} />}
					</div>
					<div className="px-2">
						<SourceProblem error={state?.camera.error ?? null} since={state?.camera.value_time ? timeAgo(state.camera.value_time) : null} />
						<SourceProblem error={state?.detection.error ?? null} since={null} />
					</div>
				</Card>
				<section className="flex flex-col gap-3">
					<div className="flex justify-between items-center">
						<h2 className="text-lg font-medium text-gray-12">Needs you</h2>
						<Link href="/decisions" className="text-sm transition-colors duration-200 text-gray-10 hover:text-gray-12">
							All decisions
						</Link>
					</div>
					{waiting.length === 0 ? (
						<Card className="flex justify-center items-center min-h-[120px]">
							<p className="text-[15px] text-gray-10">Nothing is waiting for you.</p>
						</Card>
					) : (
						waiting.slice(0, 2).map((decision) => <DecisionCard key={decision.id} decision={decision} />)
					)}
				</section>
			</div>
			<Accessories />
			<Automations />
			<Timeline limit={12} />
		</>
	);
}
