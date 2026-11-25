"use client";

import Link from "next/link";
import { useState } from "react";
import { Automations } from "@/components/Automations";
import { boxesFrom, CameraView } from "@/components/CameraView";
import { DecisionCard } from "@/components/DecisionCard";
import { LightCard, PlugCard, SirenCard } from "@/components/DeviceCards";
import { HomeReadings, HomeSheets, type OpenSheet } from "@/components/HomeCards";
import { SourceProblem } from "@/components/PageTitle";
import { Today } from "@/components/Today";
import { useDetections } from "@/components/useDetections";
import { timeAgo, useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

export default function Overview() {
	const { state, decisions, agentError } = useHome();
	const live = useDetections();
	const [open, setOpen] = useState<OpenSheet>(null);
	const detection = live.detection ?? state?.detection.value ?? null;
	const waiting = (decisions ?? []).filter((item) => item.to_person && item.action === null);

	return (
		<>
			{agentError && <p className="text-[15px] text-gray-11">{agentError}</p>}
			<HomeReadings onOpen={setOpen} />
			<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<Card className="overflow-hidden relative p-0">
					<CameraView
						streamUrl={state?.camera.value_time ? "/api/camera/stream" : null}
						boxes={detection ? boxesFrom(detection.attributes, detection.frame_size) : []}
					/>
					{/* With no picture, the reason sits where the picture would be. */}
					{(state?.camera.error || !state?.camera.value_time) && (
						<div className="flex absolute inset-0 justify-center items-center p-6 text-center bg-gray-3">
							{state?.camera.error ? (
								<SourceProblem error={state.camera.error} since={state.camera.value_time ? timeAgo(state.camera.value_time) : null} />
							) : (
								<p className="text-sm text-gray-10">Connecting to the camera…</p>
							)}
						</div>
					)}
				</Card>
				<div className="flex flex-col gap-5">
					{waiting.length > 0 && (
						<section className="flex flex-col gap-3">
							<div className="flex justify-between items-center">
								<h2 className="text-lg font-medium text-gray-12">Needs you</h2>
								<Link href="/decisions" className="text-sm transition-colors duration-200 text-gray-10 hover:text-gray-12">
									{waiting.length > 1 ? `All ${waiting.length} decisions` : "All decisions"}
								</Link>
							</div>
							<DecisionCard decision={waiting[0]} />
						</section>
					)}
					<Today />
				</div>
			</div>
			<SourceProblem error={state?.detection.error ?? null} since={null} />
			{/* Three cards side by side need about 1000px of content; below that the light and plug pair up. */}
			<div className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[1360px]:grid-cols-3">
				<LightCard onOpen={setOpen} />
				<PlugCard onOpen={setOpen} />
				<SirenCard onOpen={setOpen} />
			</div>
			<Automations />
			<HomeSheets open={open} onClose={() => setOpen(null)} />
		</>
	);
}
