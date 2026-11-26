"use client";

import { faClock, faHandPointer, faKey, faSignal } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import clsx from "clsx";
import { CardTop, moment, Reading } from "@/components/HomeParts";
import { PageTitle } from "@/components/PageTitle";
import { type HomeState, type TimelineEntry, useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

// The watch asks roomnet every 3 seconds (watch/src/main.cpp); three
// missed calls in a row read as gone.
const SEEN_RECENTLY_MS = 10_000;
const FROM_WATCH = " from the watch";

// LVGL's default theme on the watch draws switches and sliders in this blue.
const LVGL_BLUE = "#2196F3";

function isToday(iso: string): boolean {
	return new Date(iso).toDateString() === new Date().toDateString();
}

function clock(iso: string): string {
	return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function connected(lastSeen: string | null): boolean {
	return Boolean(lastSeen) && Date.now() - new Date(lastSeen as string).getTime() < SEEN_RECENTLY_MS;
}

/** The three things to know about the watch, read in a second, the way the overview opens. */
function WatchReadings({ watch, actions }: { watch: HomeState["watch"]; actions: TimelineEntry[] }) {
	const live = connected(watch.last_seen);
	const cells: { icon: typeof faSignal; label: string; value: string; unit?: string; detail: string; dot?: boolean }[] = [
		{
			icon: faSignal,
			label: "Connection",
			value: live ? "Connected" : watch.last_seen ? "Away" : "Waiting",
			detail: live ? "Checks in every 3 seconds" : watch.last_seen ? `Last seen ${moment(watch.last_seen)}` : "It hasn't called roomnet yet",
			dot: !live,
		},
		{
			icon: faHandPointer,
			label: "Last from your wrist",
			value: actions[0] ? actions[0].text.slice(0, -FROM_WATCH.length).replace(/^Bulb /, "Light ") : "–",
			detail: actions[0] ? moment(actions[0].time) : "Nothing done from the watch yet",
		},
		{
			icon: faKey,
			label: "Pairing",
			value: "Paired",
			detail: watch.address ? `${watch.address} · port ${watch.port}` : `Port ${watch.port}`,
		},
	];

	return (
		<Card className="grid overflow-hidden grid-cols-1 p-0 sm:grid-cols-3">
			{cells.map((cell) => (
				<div key={cell.label} className="flex flex-col gap-3 p-4 min-w-0 border-t border-gray-3 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 sm:p-5">
					<span className="flex gap-2 items-center text-sm text-gray-11">
						<FontAwesomeIcon icon={cell.icon} className="size-[13px] shrink-0 text-gray-10" />
						<span className="truncate">{cell.label}</span>
						{cell.dot && <span className="ml-auto rounded-full size-2 bg-red-500" />}
					</span>
					<Reading value={cell.value} unit={cell.unit} detail={cell.detail} />
				</div>
			))}
		</Card>
	);
}

function LvglSwitch({ on }: { on: boolean | null }) {
	return (
		<span
			className={clsx("flex items-center p-[3px] rounded-full w-[58px] h-[30px] transition-colors", on === null && "opacity-40")}
			style={{ background: on ? LVGL_BLUE : "#3a3a3a" }}
		>
			<span className={clsx("block bg-white rounded-full size-6 transition-transform", on && "translate-x-[28px]")} />
		</span>
	);
}

/** The watch drawn as it sits on the wrist, its screen showing what the firmware shows now. */
function WatchMirror({ state, live }: { state: HomeState; live: boolean }) {
	const bulb = state.bulb.value;
	const plug = state.plug.value;
	const problem = state.bulb.error ?? state.plug.error;

	return (
		<div className="flex relative flex-col items-center py-2">
			{/* Strap, case and crown. */}
			<div className="w-[150px] h-14 rounded-t-[22px] bg-gradient-to-b from-[#3a3a3a]/30 to-[#262626]" />
			<div className="relative p-[14px] rounded-[46px] bg-[#1b1b1b] shadow-[0_24px_48px_-12px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)]">
				<span className="absolute top-[38%] -right-[7px] w-[9px] h-11 rounded-r-md bg-[#2a2a2a]" />
				<div className="flex flex-col gap-[14px] p-[18px] rounded-[30px] size-[236px] sm:size-[264px] bg-black text-white font-[Montserrat,system-ui,sans-serif]">
					<p className="text-[14px] leading-none text-[#9e9e9e]">roomnet</p>
					<div className="flex justify-between items-center">
						<span className="text-[20px] leading-none">Bulb</span>
						<LvglSwitch on={bulb ? bulb.on : null} />
					</div>
					<div className="relative h-[10px] rounded-full bg-[#2c3e50]/60">
						<div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${bulb?.brightness ?? 0}%`, background: LVGL_BLUE }} />
						<div
							className="absolute top-1/2 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 size-[18px]"
							style={{ left: `${bulb?.brightness ?? 0}%`, boxShadow: `0 0 0 3px ${LVGL_BLUE}` }}
						/>
					</div>
					<div className="flex gap-2 justify-between items-center">
						<span className="text-[20px] leading-none">Plug</span>
						<span className="ml-auto text-[13px] tabular-nums text-[#cfcfcf]">{plug ? `${plug.watts.toFixed(1)} W` : ""}</span>
						<LvglSwitch on={plug ? plug.on : null} />
					</div>
					<p className="text-[11px] leading-snug text-[#ff9800] line-clamp-2">{live ? (problem ?? "") : "Joining WiFi..."}</p>
				</div>
			</div>
			<div className="w-[150px] h-14 rounded-b-[22px] bg-gradient-to-t from-[#3a3a3a]/30 to-[#262626]" />
		</div>
	);
}

/** What was done from the watch today, in the shape of the overview's Today card. */
function WatchActivity({ actions }: { actions: TimelineEntry[] }) {
	const today = actions.filter((entry) => isToday(entry.time));
	const perHour = Array.from({ length: 24 }, () => 0);
	for (const entry of today) perHour[new Date(entry.time).getHours()] += 1;
	const busiest = Math.max(1, ...perHour);
	const currentHour = new Date().getHours();

	return (
		<Card className="flex flex-col flex-1 gap-6">
			<div className="flex flex-col gap-3">
				<CardTop icon={faHandPointer} label="From the watch" />
				<Reading
					value={String(today.length)}
					unit={today.length === 1 ? "action today" : "actions today"}
					detail={today[0] ? `Last one ${moment(today[0].time)}` : "Flip a switch on the watch and it shows here"}
				/>
			</div>
			<div className="flex flex-col flex-1 gap-2 justify-end">
				<div className="flex gap-[3px] items-end h-28">
					{perHour.map((count, hour) => (
						<div
							key={hour}
							title={`${String(hour).padStart(2, "0")}:00 · ${count} ${count === 1 ? "action" : "actions"}`}
							className={clsx(
								"flex-1 rounded-sm",
								hour > currentHour ? "bg-gray-3" : hour === currentHour ? "bg-gray-12" : count > 0 ? "bg-gray-7" : "bg-gray-4",
							)}
							style={{ height: count > 0 ? `${Math.max(8, (count / busiest) * 100)}%` : "3px" }}
						/>
					))}
				</div>
				<div className="flex justify-between text-[11px] tabular-nums text-gray-10">
					<span>00</span>
					<span>06</span>
					<span>12</span>
					<span>18</span>
					<span>24</span>
				</div>
			</div>
			{actions.length > 0 && (
				<ul className="flex flex-col">
					{actions.slice(0, 6).map((entry) => (
						<li key={entry.key} className="flex gap-4 justify-between items-baseline py-2.5 border-t border-gray-3">
							<span className="text-sm truncate text-gray-11">{entry.text.slice(0, -FROM_WATCH.length)}</span>
							<span className="text-sm tabular-nums shrink-0 text-gray-10">{isToday(entry.time) ? clock(entry.time) : moment(entry.time)}</span>
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}

function PairSteps() {
	const steps = [
		<>
			Make a token with <code className="text-gray-12">openssl rand -hex 32</code> and add it to <code className="text-gray-12">app/site/devices.env</code> as{" "}
			<code className="text-gray-12">WATCH_TOKEN</code>.
		</>,
		<>
			Put the same token, your WiFi and this Mac's address in <code className="text-gray-12">watch/src/secrets.h</code>, then flash the watch with{" "}
			<code className="text-gray-12">pio run -t upload</code>.
		</>,
		<>Restart roomnet. The watch shows up here within a few seconds.</>,
	];
	return (
		<Card className="flex flex-col gap-5">
			<CardTop icon={faClock} label="T-Watch S3" />
			<Reading value="Not paired" detail="Pair it once and it switches the light and the plug from your wrist" />
			<ol className="flex flex-col">
				{steps.map((step, index) => (
					<li key={index} className="flex gap-3 items-baseline py-3 text-sm border-t border-gray-3 text-gray-11">
						<span className="flex justify-center items-center text-xs tabular-nums rounded-full size-5 shrink-0 bg-gray-3 text-gray-12">{index + 1}</span>
						<span>{step}</span>
					</li>
				))}
			</ol>
		</Card>
	);
}

export default function Watch() {
	const { state, agentError } = useHome();
	const watch = state?.watch;
	const actions = (state?.timeline ?? []).filter((entry) => entry.text.endsWith(FROM_WATCH));
	const live = connected(watch?.last_seen ?? null);

	return (
		<>
			<PageTitle title="Watch" />
			{agentError && <p className="text-[15px] text-gray-11">{agentError}</p>}
			{state && watch && !watch.enabled && <PairSteps />}
			{state && watch?.enabled && (
				<>
					<WatchReadings watch={watch} actions={actions} />
					<div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
						<Card className="flex overflow-hidden flex-col gap-4">
							<CardTop icon={faClock} label="On the watch now" />
							<div className="flex flex-1 justify-center items-center">
								<WatchMirror state={state} live={live} />
							</div>
						</Card>
						<WatchActivity actions={actions} />
					</div>
				</>
			)}
		</>
	);
}
