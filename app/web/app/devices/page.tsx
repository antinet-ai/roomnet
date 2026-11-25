"use client";

import {
	faCamera,
	faChevronRight,
	faDoorOpen,
	faLightbulb,
	faPersonWalking,
	faPlug,
	faTemperatureHalf,
	faTowerBroadcast,
	type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { HomeSheets, type OpenSheet } from "@/components/HomeCards";
import { moment } from "@/components/HomeParts";
import { PageTitle } from "@/components/PageTitle";
import { type SourceState, useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

type DeviceRow = {
	key: string;
	icon: IconDefinition;
	kind: string;
	name: string | null;
	model: string | null;
	batteryLow: boolean;
	source: SourceState<unknown> | undefined;
	sheet: OpenSheet;
};

function connected(source: SourceState<unknown> | undefined): boolean {
	return Boolean(source?.value_time) && !source?.error;
}

function described<T extends { name: string; model: string }>(source: SourceState<T> | undefined) {
	return { name: source?.value?.name ?? null, model: source?.value?.model ?? null, source };
}

function batteryLow(source: SourceState<{ battery_low: boolean }> | undefined): boolean {
	return Boolean(source?.value?.battery_low);
}

/** Connected reads as plain text; only a device that is not answering gets colour. */
function Status({ row }: { row: DeviceRow }) {
	if (connected(row.source)) return <span className="text-[13px] text-gray-10">Connected</span>;
	return (
		<span className="flex gap-1.5 items-center text-[13px] text-gray-11">
			<span className="rounded-full size-2 bg-red-500" />
			{row.source?.value_time ? `Seen ${moment(row.source.value_time)}` : "Offline"}
		</span>
	);
}

/** Under the name: the device's problem in one sentence when it has one, otherwise what it is. */
function subtitle(row: DeviceRow): string {
	if (row.source?.error) return row.source.error;
	if (row.model) return `${row.kind} · ${row.model}`;
	return row.name ? row.kind : "Waiting for its first answer";
}

function RowContent({ row }: { row: DeviceRow }) {
	return (
		<>
			<span className="flex justify-center items-center rounded-lg size-9 shrink-0 bg-gray-3 text-gray-11">
				<FontAwesomeIcon icon={row.icon} className="size-[14px]" />
			</span>
			<span className="flex flex-col flex-1 min-w-0">
				<span className="text-sm font-medium truncate text-gray-12">{row.name ?? row.kind}</span>
				<span className={row.source?.error ? "text-[13px] line-clamp-2 text-gray-11" : "text-[13px] truncate text-gray-10"}>{subtitle(row)}</span>
			</span>
			{row.batteryLow && <span className="px-2 h-6 text-xs leading-6 rounded-full shrink-0 bg-gray-3 text-gray-11">Battery low</span>}
			<Status row={row} />
		</>
	);
}

export default function Devices() {
	const { state } = useHome();
	const [open, setOpen] = useState<OpenSheet>(null);
	const camera = state?.camera;

	const rows: DeviceRow[] = [
		{
			key: "camera",
			icon: faCamera,
			kind: "Camera",
			name: null,
			model: camera?.value ? `${camera.value.width} × ${camera.value.height}` : null,
			batteryLow: false,
			source: camera,
			sheet: null,
		},
		{ key: "bulb", icon: faLightbulb, kind: "Light", ...described(state?.bulb), batteryLow: false, sheet: "bulb" },
		{ key: "plug", icon: faPlug, kind: "Smart plug", ...described(state?.plug), batteryLow: false, sheet: "plug" },
		{ key: "hub", icon: faTowerBroadcast, kind: "Hub and siren", ...described(state?.hub), batteryLow: false, sheet: "siren" },
		{ key: "door", icon: faDoorOpen, kind: "Door sensor", ...described(state?.door), batteryLow: batteryLow(state?.door), sheet: "door" },
		{ key: "motion", icon: faPersonWalking, kind: "Motion sensor", ...described(state?.motion), batteryLow: batteryLow(state?.motion), sheet: "motion" },
		{ key: "climate", icon: faTemperatureHalf, kind: "Climate sensor", ...described(state?.climate), batteryLow: batteryLow(state?.climate), sheet: "climate" },
	];
	const online = rows.filter((row) => connected(row.source)).length;

	return (
		<>
			<PageTitle title="Devices">
				<p className="text-sm tabular-nums text-gray-10">
					{online} of {rows.length} connected
				</p>
			</PageTitle>
			<Card className="overflow-hidden p-0">
				<ul className="flex flex-col">
					{rows.map((row) => (
						<li key={row.key} className="border-t border-gray-3 first:border-t-0">
							{row.sheet ? (
								<button
									type="button"
									onClick={() => setOpen(row.sheet)}
									className="flex gap-3 items-center px-4 py-3.5 w-full text-left transition-colors duration-150 group hover:bg-gray-2 sm:px-5"
								>
									<RowContent row={row} />
									<FontAwesomeIcon
										icon={faChevronRight}
										className="transition-all duration-200 size-[10px] shrink-0 text-gray-8 group-hover:translate-x-0.5 group-hover:text-gray-11"
									/>
								</button>
							) : (
								<div className="flex gap-3 items-center px-4 py-3.5 pr-[42px] sm:px-5 sm:pr-[46px]">
									<RowContent row={row} />
								</div>
							)}
						</li>
					))}
				</ul>
			</Card>
			<HomeSheets open={open} onClose={() => setOpen(null)} />
		</>
	);
}
