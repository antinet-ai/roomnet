"use client";

import { useState } from "react";
import { Button } from "@/ui/Button";
import { Switch } from "@/ui/Switch";
import { ColourWheel, Segmented, TallSlider, useCountdown, useDeviceAction } from "./controls";
import { SourceProblem } from "./PageTitle";
import { SeriesChart } from "./SeriesChart";
import { JudgeLine } from "./SeriesPanel";
import {
	type BulbValue,
	bulbColour,
	duration,
	PLUG_SERIES,
	postJson,
	type SensorEvent,
	type SourceState,
	timeAgo,
	useHome,
	whiteColour,
} from "./useHome";

function since<T>(source: SourceState<T> | null | undefined): string | null {
	return source?.value_time ? timeAgo(source.value_time) : null;
}

function Problem({ error }: { error: string | null }) {
	return error ? <p className="text-sm text-red-500">{error}</p> : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="flex justify-between items-center py-3 border-t border-gray-3 first:border-t-0">
			<p className="text-sm text-gray-11">{label}</p>
			<div className="text-sm font-medium tabular-nums text-gray-12">{children}</div>
		</div>
	);
}

// White presets from candlelight to daylight, as the bulb's own app offers.
export const WHITES = [2700, 3500, 4500, 5500, 6500];
// Colour presets: hue and saturation.
export const COLOURS: [number, number][] = [
	[0, 100],
	[30, 100],
	[55, 100],
	[120, 80],
	[200, 100],
	[260, 80],
	[310, 80],
];

export function BulbControls() {
	const { state, refresh } = useHome();
	const source = state?.bulb;
	const bulb: BulbValue | null = source?.value ?? null;
	const { busy, error, run } = useDeviceAction(refresh);
	const [mode, setMode] = useState<"colour" | "white">(bulb?.kelvin === null ? "colour" : "white");
	const off = !bulb || !bulb.on;

	return (
		<>
			<div className="flex gap-6 justify-center items-center">
				<TallSlider
					label="Brightness"
					value={bulb?.brightness ?? 1}
					min={1}
					max={100}
					fill={bulb ? bulbColour(bulb) : "var(--gray-6)"}
					disabled={off || busy}
					onCommit={(brightness) => run(() => postJson("/api/bulb/brightness", { brightness }))}
				/>
				<div className="flex flex-col gap-3 items-center">
					<p className="text-sm text-gray-11">{bulb ? (bulb.on ? "On" : "Off") : "–"}</p>
					<Switch
						checked={bulb?.on ?? false}
						disabled={!bulb || busy}
						onCheckedChange={(on) => run(() => postJson("/api/bulb", { on }))}
					/>
				</div>
			</div>
			<Segmented
				label="Light"
				value={mode}
				onChange={setMode}
				options={[
					{ value: "white", label: "White" },
					{ value: "colour", label: "Colour" },
				]}
			/>
			{mode === "colour" ? (
				<div className="flex flex-col gap-5">
					<ColourWheel
						hue={bulb && bulb.kelvin === null ? bulb.hue : null}
						saturation={bulb && bulb.kelvin === null ? bulb.saturation : null}
						disabled={off || busy}
						onCommit={(hue, saturation) => run(() => postJson("/api/bulb/colour", { hue, saturation }))}
					/>
					<div className="flex justify-between">
						{COLOURS.map(([hue, saturation]) => (
							<button
								key={hue}
								type="button"
								aria-label={`Colour ${hue}`}
								disabled={off || busy}
								onClick={() => run(() => postJson("/api/bulb/colour", { hue, saturation }))}
								className="rounded-full ring-2 ring-transparent transition-transform duration-150 size-9 hover:scale-110 hover:ring-gray-5 disabled:opacity-50"
								style={{ background: `hsl(${hue} ${saturation}% 58%)` }}
							/>
						))}
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<div className="flex justify-between">
						{WHITES.map((kelvin) => (
							<button
								key={kelvin}
								type="button"
								disabled={off || busy}
								onClick={() => run(() => postJson("/api/bulb/white", { kelvin }))}
								className="flex flex-col gap-1.5 items-center disabled:opacity-50"
							>
								<span
									className={
										bulb?.kelvin === kelvin
											? "rounded-full ring-2 ring-offset-2 size-10 ring-gray-12 ring-offset-gray-1"
											: "rounded-full ring-1 transition-transform duration-150 size-10 ring-gray-4 hover:scale-110"
									}
									style={{ background: whiteColour(kelvin) }}
								/>
								<span className="text-[11px] tabular-nums text-gray-10">{kelvin} K</span>
							</button>
						))}
					</div>
				</div>
			)}
			{off && bulb && <p className="text-sm text-center text-gray-10">Turn the bulb on to change its light.</p>}
			<Problem error={error} />
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</>
	);
}

export const TIMERS = [15 * 60, 30 * 60, 60 * 60, 2 * 60 * 60];

export function PlugControls() {
	const { state, refresh } = useHome();
	const source = state?.plug;
	const plug = source?.value ?? null;
	const series = state?.series[PLUG_SERIES] ?? null;
	const { busy, error, run } = useDeviceAction(refresh);
	const left = useCountdown(plug?.timer?.remaining_s ?? null);

	return (
		<>
			<div className="flex justify-between items-end">
				<p className="text-5xl font-medium tracking-tight tabular-nums text-gray-12">
					{plug ? plug.watts.toFixed(1) : "–"}
					<span className="ml-1 text-xl text-gray-10">W</span>
				</p>
				<Switch
					checked={plug?.on ?? false}
					disabled={!plug || busy}
					onCheckedChange={(on) => run(() => postJson("/api/plug", { on }))}
				/>
			</div>
			<SeriesChart points={(series?.history ?? []).slice(-300).map(([, watts]) => watts)} unit="W" height={120} />
			<JudgeLine series={series} waiting="Waiting for the plug" />
			<div>
				<Row label="Today">{plug ? `${(plug.today_wh / 1000).toFixed(2)} kWh` : "–"}</Row>
				<Row label="This month">{plug ? `${(plug.month_wh / 1000).toFixed(2)} kWh` : "–"}</Row>
				<Row label="On today">{plug ? duration(plug.today_minutes * 60) : "–"}</Row>
			</div>
			<div className="flex flex-col gap-3">
				<p className="text-sm font-medium text-gray-12">
					{plug?.timer && left !== null
						? `Turns ${plug.timer.turn_on ? "on" : "off"} in ${duration(left)}`
						: `Turn ${plug?.on ? "off" : "on"} in`}
				</p>
				{plug?.timer ? (
					<Button variant="gray" size="sm" disabled={busy} onClick={() => run(() => postJson("/api/plug/timer", undefined, "DELETE"))}>
						Cancel timer
					</Button>
				) : (
					<div className="grid grid-cols-4 gap-2">
						{TIMERS.map((seconds) => (
							<Button
								key={seconds}
								variant="gray"
								size="sm"
								disabled={!plug || busy}
								onClick={() => run(() => postJson("/api/plug/timer", { seconds, turn_on: !plug?.on }))}
							>
								{duration(seconds)}
							</Button>
						))}
					</div>
				)}
			</div>
			<Problem error={error} />
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</>
	);
}

const SIREN_LENGTHS = [5, 10, 30, 60];

export function SirenControls() {
	const { state, refresh } = useHome();
	const source = state?.hub;
	const hub = source?.value ?? null;
	const { busy, error, run } = useDeviceAction(refresh);
	const [ringtone, setRingtone] = useState("Alarm1");
	const [volume, setVolume] = useState<"Low" | "Normal" | "High">("Normal");
	const [seconds, setSeconds] = useState(10);

	return (
		<>
			<p className="text-sm text-gray-11">
				The hub plays the sound you choose for as long as you choose. It never sounds on its own.
			</p>
			<div className="flex flex-col gap-2">
				<p className="text-xs font-medium text-gray-10">Sound</p>
				<div className="flex flex-wrap gap-2">
					{(hub?.ringtones ?? []).map((name) => (
						<button
							key={name}
							type="button"
							onClick={() => setRingtone(name)}
							className={
								name === ringtone
									? "px-3 h-8 text-sm font-medium rounded-full bg-gray-12 text-gray-1"
									: "px-3 h-8 text-sm rounded-full transition-colors duration-200 bg-gray-3 text-gray-11 hover:bg-gray-4"
							}
						>
							{name.replace(/([a-z])([A-Z0-9])/g, "$1 $2")}
						</button>
					))}
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<p className="text-xs font-medium text-gray-10">Volume</p>
				<Segmented
					label="Volume"
					value={volume}
					onChange={setVolume}
					options={[
						{ value: "Low", label: "Low" },
						{ value: "Normal", label: "Normal" },
						{ value: "High", label: "High" },
					]}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<p className="text-xs font-medium text-gray-10">Length</p>
				<Segmented
					label="Length"
					value={seconds}
					onChange={setSeconds}
					options={SIREN_LENGTHS.map((value) => ({ value, label: duration(value) }))}
				/>
			</div>
			{hub?.in_alarm ? (
				<Button variant="dark" size="lg" disabled={busy} onClick={() => run(() => postJson("/api/siren", undefined, "DELETE"))}>
					Stop the siren
				</Button>
			) : (
				<Button
					variant="destructive"
					size="lg"
					disabled={!hub || busy}
					onClick={() => run(() => postJson("/api/siren", { ringtone, volume, seconds }))}
				>
					Sound the siren
				</Button>
			)}
			<Problem error={error} />
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</>
	);
}

export function ClimateControls() {
	const { state } = useHome();
	const source = state?.climate;
	const climate = source?.value ?? null;
	const record = state?.climate_record.value ?? [];
	const temperature = climate ? state?.series[`${climate.name}-temperature`] ?? null : null;
	const humidity = climate ? state?.series[`${climate.name}-humidity`] ?? null : null;

	return (
		<>
			<div className="grid grid-cols-2 gap-4">
				<div>
					<p className="text-xs text-gray-10">Temperature</p>
					<p className="text-4xl font-medium tracking-tight tabular-nums text-gray-12">
						{climate ? `${climate.temperature.toFixed(1)}°` : "–"}
					</p>
				</div>
				<div>
					<p className="text-xs text-gray-10">Humidity</p>
					<p className="text-4xl font-medium tracking-tight tabular-nums text-gray-12">
						{climate ? `${climate.humidity.toFixed(0)}%` : "–"}
					</p>
				</div>
			</div>
			<div className="flex flex-col gap-2">
				<p className="text-xs font-medium text-gray-10">Last 24 hours, from the sensor</p>
				<SeriesChart points={record.map((item) => item.temperature)} unit="°C" height={100} />
				<SeriesChart points={record.map((item) => item.humidity)} unit="%" height={70} />
				<SourceProblem error={state?.climate_record.error ?? null} since={null} />
			</div>
			<div className="flex flex-col gap-2">
				<JudgeLine series={temperature} waiting="Waiting for the sensor" />
				<JudgeLine series={humidity} waiting="Waiting for the sensor" />
			</div>
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</>
	);
}

const EVENT_WORDS: Record<string, string> = { Open: "Opened", Close: "Closed", KeepOpen: "Left open", Motion: "Motion" };

export function EventList({ events, source }: { events: SensorEvent[]; source: SourceState<unknown> | undefined }) {
	return (
		<>
			<div className="flex flex-col">
				{events.length === 0 && <p className="text-sm text-gray-10">Nothing yet.</p>}
				{events.map((event) => (
					<Row key={event.id} label={EVENT_WORDS[event.event] ?? event.event}>
						<span className="font-normal text-gray-10">{timeAgo(event.time)}</span>
					</Row>
				))}
			</div>
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</>
	);
}
