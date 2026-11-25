"use client";

import { faBell, faChartLine, faLightbulb, faPlug } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import { useState } from "react";
import { Button } from "@/ui/Button";
import { Card } from "@/ui/Card";
import { Switch } from "@/ui/Switch";
import { TickSlider, useCountdown, useDeviceAction } from "./controls";
import { COLOURS, TIMERS, WHITES } from "./DeviceSheets";
import type { OpenSheet } from "./HomeCards";
import { CardTop, kwh, Reading, since } from "./HomeParts";
import { SourceProblem } from "./PageTitle";
import { type BulbValue, bulbColour, duration, postJson, type SourceState, useHome, whiteColour } from "./useHome";

type LightPreset = { name: string; colour: string; matches: (bulb: BulbValue) => boolean; send: () => Promise<void> };

const COLOUR_NAMES: Record<number, string> = { 0: "Red", 30: "Amber", 120: "Green", 200: "Blue" };

// The card offers the two whites people reach for and four clear colours;
// every other white and colour is one tap away on the custom swatch.
const LIGHT_PRESETS: LightPreset[] = [
	...[WHITES[0], WHITES[WHITES.length - 1]].map((kelvin, index) => ({
		name: index === 0 ? "Warm white" : "Daylight",
		colour: whiteColour(kelvin),
		matches: (bulb: BulbValue) => bulb.kelvin === kelvin,
		send: () => postJson("/api/bulb/white", { kelvin }),
	})),
	...COLOURS.filter(([hue]) => hue in COLOUR_NAMES).map(([hue, saturation]) => ({
		name: COLOUR_NAMES[hue],
		colour: `hsl(${hue} ${saturation}% 58%)`,
		matches: (bulb: BulbValue) =>
			bulb.kelvin === null && bulb.hue !== null && bulb.saturation !== null && Math.abs(bulb.hue - hue) <= 4 && Math.abs(bulb.saturation - saturation) <= 8,
		send: () => postJson("/api/bulb/colour", { hue, saturation }),
	})),
];

function Problems({ error, source }: { error: string | null; source: SourceState<unknown> | undefined }) {
	return (
		<>
			{error && <p className="text-sm text-red-500">{error}</p>}
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</>
	);
}

function Swatch({ label, background, selected, disabled, onClick }: { label: string; background: string; selected: boolean; disabled: boolean; onClick: () => void }) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			aria-pressed={selected}
			disabled={disabled}
			onClick={onClick}
			className={clsx(
				"flex-1 rounded-full transition-transform duration-150 aspect-square min-w-0 max-w-8 disabled:cursor-not-allowed disabled:opacity-40",
				selected ? "ring-2 ring-offset-2 ring-gray-12 ring-offset-gray-1" : "ring-1 ring-black/10 enabled:hover:scale-110",
			)}
			style={{ background }}
		/>
	);
}

export function LightCard({ onOpen }: { onOpen: (sheet: OpenSheet) => void }) {
	const { state, refresh } = useHome();
	const source = state?.bulb;
	const bulb = source?.value ?? null;
	const { busy, error, run } = useDeviceAction(refresh);
	const [preview, setPreview] = useState<number | null>(null);
	const on = Boolean(bulb?.on);
	const current = bulb ? LIGHT_PRESETS.find((preset) => preset.matches(bulb)) : undefined;
	const lightName = !bulb ? null : current ? current.name : bulb.kelvin === null ? "Custom colour" : `White, ${bulb.kelvin} K`;

	return (
		<Card className="flex flex-col gap-5 h-full">
			<CardTop icon={faLightbulb} label={bulb?.name ?? "Light"}>
				<Switch aria-label="Light on" checked={on} disabled={!bulb || busy} onCheckedChange={(next) => run(() => postJson("/api/bulb", { on: next }))} />
			</CardTop>
			<Reading
				value={!bulb ? "–" : on ? `${preview ?? bulb.brightness}%` : "Off"}
				unit={on ? "brightness" : undefined}
				detail={on ? lightName : bulb ? "Turn it on to set the light" : undefined}
			/>
			<div className="flex flex-col gap-4 mt-auto">
				<TickSlider
					label="Brightness"
					value={bulb?.brightness ?? 1}
					min={1}
					max={100}
					fill={bulb && on ? bulbColour(bulb) : "var(--gray-8)"}
					disabled={!on || busy}
					onPreview={setPreview}
					onCommit={(brightness) => run(() => postJson("/api/bulb/brightness", { brightness }))}
				/>
				<div className="flex gap-2.5 justify-between items-center">
					{LIGHT_PRESETS.map((preset) => (
						<Swatch
							key={preset.name}
							label={preset.name}
							background={preset.colour}
							selected={on && current === preset}
							disabled={!on || busy}
							onClick={() => run(preset.send)}
						/>
					))}
					<span className="mx-0.5 w-px h-5 shrink-0 bg-gray-4" />
					<Swatch
						label="More colours and whites"
						background="conic-gradient(red, yellow, lime, cyan, blue, magenta, red)"
						selected={on && Boolean(bulb) && !current}
						disabled={!bulb}
						onClick={() => onOpen("bulb")}
					/>
				</div>
			</div>
			<Problems error={error} source={source} />
		</Card>
	);
}

export function PlugCard({ onOpen }: { onOpen: (sheet: OpenSheet) => void }) {
	const { state, refresh } = useHome();
	const source = state?.plug;
	const plug = source?.value ?? null;
	const { busy, error, run } = useDeviceAction(refresh);
	const left = useCountdown(plug?.timer?.remaining_s ?? null);
	const on = Boolean(plug?.on);

	return (
		<Card className="flex flex-col gap-5 h-full">
			<CardTop icon={faPlug} label={plug?.name ?? "Plug"}>
				<Switch aria-label="Plug on" checked={on} disabled={!plug || busy} onCheckedChange={(next) => run(() => postJson("/api/plug", { on: next }))} />
			</CardTop>
			<Reading
				value={!plug ? "–" : on ? plug.watts.toFixed(1) : "Off"}
				unit={on ? "W right now" : undefined}
				detail={plug ? `${kwh(plug.today_wh)} today · ${kwh(plug.month_wh)} this month` : undefined}
			/>
			<div className="flex flex-col gap-3 mt-auto">
				{plug?.timer && left !== null ? (
					<div className="flex gap-3 justify-between items-center px-4 h-11 rounded-xl bg-gray-3">
						<p className="text-sm tabular-nums text-gray-12">
							Turns {plug.timer.turn_on ? "on" : "off"} in {duration(left)}
						</p>
						<Button variant="transparent" size="xs" className="px-0" disabled={busy} onClick={() => run(() => postJson("/api/plug/timer", undefined, "DELETE"))}>
							Cancel
						</Button>
					</div>
				) : (
					<div className="flex flex-col gap-2">
						<p className="text-[13px] text-gray-10">Turn {on ? "off" : "on"} in</p>
						<div className="grid grid-cols-4 gap-2">
							{TIMERS.map((seconds) => (
								<Button
									key={seconds}
									variant="outline"
									size="xs"
									className="px-0"
									disabled={!plug || busy}
									onClick={() => run(() => postJson("/api/plug/timer", { seconds, turn_on: !on }))}
								>
									{duration(seconds)}
								</Button>
							))}
						</div>
					</div>
				)}
				<Button variant="transparent" size="xs" className="justify-start self-start px-0" disabled={!plug} onClick={() => onOpen("plug")}>
					<FontAwesomeIcon icon={faChartLine} className="size-[12px]" />
					Power history
				</Button>
			</div>
			<Problems error={error} source={source} />
		</Card>
	);
}

export function SirenCard({ onOpen }: { onOpen: (sheet: OpenSheet) => void }) {
	const { state, refresh } = useHome();
	const source = state?.hub;
	const hub = source?.value ?? null;
	const { busy, error, run } = useDeviceAction(refresh);

	return (
		<Card className="flex flex-col gap-5 h-full">
			<CardTop icon={faBell} label={hub ? `Siren · ${hub.name}` : "Siren"} />
			<Reading value={hub ? (hub.in_alarm ? "Sounding" : "Quiet") : "–"} />
			<div className="mt-auto">
				{hub?.in_alarm ? (
					<Button variant="destructive" size="md" className="w-full" disabled={busy} onClick={() => run(() => postJson("/api/siren", undefined, "DELETE"))}>
						Stop
					</Button>
				) : (
					<Button variant="outline" size="md" className="w-full" disabled={!hub} onClick={() => onOpen("siren")}>
						Siren
					</Button>
				)}
			</div>
			<Problems error={error} source={source} />
		</Card>
	);
}
