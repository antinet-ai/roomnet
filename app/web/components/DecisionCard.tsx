"use client";

import { faCamera, faChartLine } from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { BoxOverlay, boxesFrom } from "./CameraView";
import { CardTop, moment } from "./HomeParts";
import { SeriesChart } from "./SeriesChart";
import { type DecisionEntry, type DeviceAction, percent, postJson, useHome } from "./useHome";

// What each device action is called on a card; the person's tap is the only thing that takes one.
const DEVICE_ACTIONS: Record<DeviceAction, { label: string; taken: string }> = {
	siren: { label: "Sound siren", taken: "Siren sounded" },
	bulb_on: { label: "Turn light on", taken: "Light turned on" },
	plug_off: { label: "Switch plug off", taken: "Plug switched off" },
};

export function headline(decision: DecisionEntry, sensorLabel: string): string {
	if (decision.source === "camera") {
		if (decision.label === "nothing") return "Nothing in view";
		const objects = decision.attributes.objects ?? decision.label;
		return objects
			.split(",")
			.map((entry) => {
				const [label, count] = entry.split(":");
				return `${count} ${label.replaceAll("-", " ")}`;
			})
			.join(", ");
	}
	return decision.label === "real" ? `Unusual ${sensorLabel.toLowerCase()} pattern` : `${sensorLabel} pattern as usual`;
}

/** Confidence the same way everywhere: a bar and its percent. */
export function Confidence({ value, threshold }: { value: number; threshold?: number }) {
	return (
		<div className="flex gap-2 items-center">
			<div className="overflow-hidden relative w-20 h-1.5 rounded-full bg-gray-4">
				<div className="absolute inset-y-0 left-0 rounded-full bg-gray-12" style={{ width: percent(value) }} />
				{threshold !== undefined && (
					<div className="absolute inset-y-0 w-px bg-gray-9" style={{ left: percent(threshold) }} />
				)}
			</div>
			<span className="text-xs tabular-nums text-gray-11">{percent(value)}</span>
		</div>
	);
}

export function DecisionCard({ decision }: { decision: DecisionEntry }) {
	const { refresh, state } = useHome();
	const series = state?.series[decision.source] ?? null;
	const sensorLabel = series?.label ?? decision.source;
	const [busy, setBusy] = useState<"confirm" | "dismiss" | null>(null);
	const [error, setError] = useState<string | null>(null);

	const takeDeviceAction = async (action: DeviceAction) => {
		setError(null);
		try {
			await postJson(`/api/decisions/${decision.id}/device-action`, { action });
			await refresh();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "The device did not do it.");
		}
	};

	const act = async (action: "confirm" | "dismiss") => {
		setBusy(action);
		setError(null);
		try {
			await postJson(`/api/decisions/${decision.id}/action`, { action });
			await refresh();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "The action was not recorded.");
		} finally {
			setBusy(null);
		}
	};

	const needsPerson = decision.to_person && decision.action === null;
	return (
		<Card className="flex flex-col gap-4">
			<div className="flex flex-col gap-3">
				<CardTop icon={decision.source === "camera" ? faCamera : faChartLine} label={`${decision.source === "camera" ? "Camera" : sensorLabel} · ${moment(decision.time)}`}>
					<Confidence value={decision.confidence} threshold={decision.threshold} />
				</CardTop>
				<p className="text-xl font-medium tracking-tight text-gray-12">{headline(decision, sensorLabel)}</p>
			</div>
			{decision.has_frame && (
				<div className="overflow-hidden relative w-full rounded-xl aspect-video bg-gray-3">
					{/* eslint-disable-next-line @next/next/no-img-element */}
					<img
						src={`/api/decisions/${decision.id}/frame.jpg`}
						alt="The frame the decision was made on"
						className="object-contain absolute inset-0 w-full h-full"
					/>
					<div className="absolute inset-0">
						<BoxOverlay boxes={boxesFrom(decision.attributes, decision.detail.frame_size ?? null)} />
					</div>
				</div>
			)}
			{decision.source !== "camera" && decision.detail.window && (
				<SeriesChart points={decision.detail.window} unit={series?.unit ?? ""} height={96} />
			)}
			{decision.to_person && (
				<div className="p-4 rounded-xl bg-gray-2">
					{decision.explanation ? (
						<p className="text-sm whitespace-pre-line text-gray-11">{decision.explanation}</p>
					) : decision.explanation_error ? (
						<p className="text-sm text-gray-11">{decision.explanation_error}</p>
					) : (
						<p className="text-sm text-gray-10">Writing the explanation on this computer…</p>
					)}
				</div>
			)}
			{decision.device_actions.length > 0 && (
				<div className="flex flex-wrap gap-2">
					{decision.device_actions.map((action) =>
						decision.device_actions_taken.includes(action) ? (
							<span key={action} className="flex items-center px-3 h-8 text-xs rounded-full bg-gray-3 text-gray-11">
								{DEVICE_ACTIONS[action].taken}
							</span>
						) : (
							<Button key={action} variant="outline" size="xs" onClick={() => takeDeviceAction(action)}>
								{DEVICE_ACTIONS[action].label}
							</Button>
						),
					)}
				</div>
			)}
			{needsPerson ? (
				<div className="flex gap-2 justify-end">
					<Button variant="gray" size="sm" disabled={busy !== null} onClick={() => act("dismiss")}>
						Dismiss
					</Button>
					<Button variant="dark" size="sm" disabled={busy !== null} onClick={() => act("confirm")}>
						Confirm
					</Button>
				</div>
			) : decision.action ? (
				<p className="text-xs text-right text-gray-10">
					{decision.action === "confirm" ? "Confirmed" : "Dismissed"} · model v{decision.model_version}
				</p>
			) : null}
			{error && <p className="text-sm text-right text-red-500">{error}</p>}
		</Card>
	);
}
