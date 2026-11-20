"use client";

import { createContext, use, useCallback, useEffect, useState } from "react";

export type SourceState<T> = {
	value: T | null;
	value_time: string | null;
	error: string | null;
	error_time: string | null;
};

export type Detection = {
	decision_id: string;
	label: string;
	confidence: number;
	attributes: Record<string, string>;
	frame_time: string;
	frame_size: [number, number] | null;
};

export type PlugValue = {
	on: boolean;
	name: string;
	model: string;
	watts: number;
	today_wh: number;
	month_wh: number;
	today_minutes: number;
	timer: { remaining_s: number; turn_on: boolean } | null;
};
export type BulbValue = {
	on: boolean;
	name: string;
	model: string;
	brightness: number;
	hue: number | null;
	saturation: number | null;
	/** Null while the bulb shows a colour. */
	kelvin: number | null;
};
export type HubValue = { name: string; model: string; in_alarm: boolean; ringtones: string[] };
export type ClimateRecord = { time: string; temperature: number; humidity: number };
export type TimelineEntry = { key: string; time: string; source: string; text: string; decision_id: string | null };
export type DeviceAction = "siren" | "bulb_on" | "plug_off";

type ChildFields = { name: string; model: string; battery_low: boolean };
export type SensorEvent = { id: number; event: string; time: string };
export type DoorValue = ChildFields & { open: boolean; events: SensorEvent[] };
export type MotionValue = ChildFields & { detected: boolean; events: SensorEvent[] };
export type ClimateValue = ChildFields & { temperature: number; humidity: number };

export type JudgeValue =
	| { phase: "reference"; held: number; needed: number }
	| {
			phase: "judging";
			label: string;
			confidence: number;
			attributes: Record<string, string>;
			decision_id: string;
	  };

/** One sensor anet judges against its own reference. */
export type Series = {
	label: string;
	unit: string;
	reading: SourceState<{ value: number }>;
	judge: SourceState<JudgeValue>;
	history: [string, number][];
};

export type HomeState = {
	camera: SourceState<{ width: number; height: number }>;
	detection: SourceState<Detection>;
	plug: SourceState<PlugValue>;
	hub: SourceState<HubValue>;
	door: SourceState<DoorValue>;
	motion: SourceState<MotionValue>;
	climate: SourceState<ClimateValue>;
	bulb: SourceState<BulbValue>;
	climate_record: SourceState<ClimateRecord[]>;
	door_lights_off: { enabled: boolean; last_run: string | null; error: string | null };
	series: Record<string, Series>;
	timeline: TimelineEntry[];
	pending: number;
};

export const PLUG_SERIES = "plug-power";

export type DecisionEntry = {
	id: string;
	task: string;
	/** "camera", or the name of the sensor whose window was judged. */
	source: string;
	time: string;
	label: string;
	attributes: Record<string, string>;
	confidence: number;
	threshold: number;
	to_person: boolean;
	model_version: number;
	model_digest: string;
	detail: { value_now?: number; window?: number[]; frame_size?: [number, number] };
	explanation: string | null;
	explanation_error: string | null;
	action: "confirm" | "dismiss" | null;
	action_error: string | null;
	has_frame: boolean;
	device_actions: DeviceAction[];
	device_actions_taken: DeviceAction[];
};

type Home = {
	state: HomeState | null;
	decisions: DecisionEntry[] | null;
	agentError: string | null;
	refresh: () => Promise<void>;
};

const HomeContext = createContext<Home>({
	state: null,
	decisions: null,
	agentError: null,
	refresh: async () => {},
});

const POLL_MILLISECONDS = 1000;

async function readJson<T>(path: string): Promise<T> {
	const response = await fetch(path, { cache: "no-store" });
	if (!response.ok) throw new Error(`${path} answered ${response.status}`);
	return (await response.json()) as T;
}

export function HomeProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState<HomeState | null>(null);
	const [decisions, setDecisions] = useState<DecisionEntry[] | null>(null);
	const [agentError, setAgentError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const [nextState, nextDecisions] = await Promise.all([
				readJson<HomeState>("/api/state"),
				readJson<DecisionEntry[]>("/api/decisions"),
			]);
			setState(nextState);
			setDecisions(nextDecisions);
			setAgentError(null);
		} catch {
			setAgentError("The home agent is not answering.");
		}
	}, []);

	useEffect(() => {
		refresh();
		const timer = window.setInterval(refresh, POLL_MILLISECONDS);
		return () => window.clearInterval(timer);
	}, [refresh]);

	return <HomeContext value={{ state, decisions, agentError, refresh }}>{children}</HomeContext>;
}

export const useHome = () => use(HomeContext);

export async function postJson(path: string, body: unknown, method: "POST" | "DELETE" = "POST"): Promise<void> {
	const response = await fetch(path, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
	if (!response.ok) {
		const detail = await response.json().catch(() => null);
		// FastAPI names a refused range as a list of problems; the first is enough for one sentence.
		const message = Array.isArray(detail?.detail) ? detail.detail[0]?.msg : detail?.detail;
		throw new Error(message ?? `The request failed (${response.status}).`);
	}
}

export function timeAgo(iso: string | null): string {
	if (!iso) return "never";
	const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
	if (seconds < 5) return "just now";
	if (seconds < 60) return `${seconds} s ago`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min ago`;
	return new Date(iso).toLocaleTimeString();
}

export function percent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

/** The bulb's light as a CSS colour: its colour, or its white temperature. */
export function bulbColour(bulb: BulbValue): string {
	if (bulb.kelvin === null && bulb.hue !== null && bulb.saturation !== null) {
		return `hsl(${bulb.hue} ${bulb.saturation}% 58%)`;
	}
	return whiteColour(bulb.kelvin ?? 4000);
}

/** A white temperature from 2500 K (candle) to 6500 K (daylight) as a CSS colour. */
export function whiteColour(kelvin: number): string {
	const warmth = Math.min(1, Math.max(0, (kelvin - 2500) / 4000));
	const mix = (warm: number, cool: number) => Math.round(warm + (cool - warm) * warmth);
	return `rgb(${mix(255, 224)} ${mix(180, 234)} ${mix(107, 255)})`;
}

export function duration(seconds: number): string {
	if (seconds < 60) return `${seconds} s`;
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	return `${Math.floor(minutes / 60)} h ${minutes % 60 ? `${minutes % 60} min` : ""}`.trim();
}
