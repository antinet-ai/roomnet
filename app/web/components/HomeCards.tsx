"use client";

import { faChevronRight, faDoorOpen, faPersonWalking, faTemperatureHalf, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Card } from "@/ui/Card";
import { BulbControls, ClimateControls, EventList, PlugControls, SirenControls } from "./DeviceSheets";
import { moment, Reading } from "./HomeParts";
import { Sheet } from "./Sheet";
import { useHome } from "./useHome";

export type OpenSheet = "plug" | "bulb" | "siren" | "door" | "motion" | "climate" | null;

/** The home's state in three readings, read in a second; each opens its history. */
export function HomeReadings({ onOpen }: { onOpen: (sheet: OpenSheet) => void }) {
	const { state } = useHome();
	const climate = state?.climate.value ?? null;
	const door = state?.door.value ?? null;
	const motion = state?.motion.value ?? null;
	const doorChanged = door?.events[0]?.time ?? null;
	const lastMotion = motion?.events[0]?.time ?? null;
	const todaysTemperatures = (state?.climate_record.value ?? [])
		.filter((record) => new Date(record.time).toDateString() === new Date().toDateString())
		.map((record) => record.temperature);
	const temperatureRange =
		todaysTemperatures.length > 1
			? `Today ${Math.min(...todaysTemperatures).toFixed(1)}° to ${Math.max(...todaysTemperatures).toFixed(1)}°`
			: undefined;

	const cells: { key: OpenSheet; icon: IconDefinition; label: string; value: string; unit?: string; detail?: string; action: string }[] = [
		{
			key: "climate",
			icon: faTemperatureHalf,
			label: climate?.name ?? "Climate",
			value: climate ? `${climate.temperature.toFixed(1)}°` : "–",
			unit: climate ? `${climate.humidity.toFixed(0)}% humidity` : undefined,
			detail: temperatureRange,
			action: "Temperature history",
		},
		{
			key: "door",
			icon: faDoorOpen,
			label: door?.name ?? "Door",
			value: door ? (door.open ? "Open" : "Closed") : "–",
			detail: door && doorChanged ? `${door.open ? "Opened" : "Closed"} ${moment(doorChanged)}` : undefined,
			action: "Door history",
		},
		{
			key: "motion",
			icon: faPersonWalking,
			label: motion?.name ?? "Motion",
			value: motion ? (motion.detected ? "Motion" : "Still") : "–",
			detail: lastMotion ? `Last movement ${moment(lastMotion)}` : undefined,
			action: "Motion history",
		},
	];

	return (
		<Card className="grid overflow-hidden grid-cols-1 p-0 sm:grid-cols-3">
			{cells.map((cell) => (
				<button
					key={cell.key}
					type="button"
					aria-label={cell.action}
					onClick={() => onOpen(cell.key)}
					className="flex flex-col gap-3 p-4 min-w-0 text-left border-t transition-colors duration-200 cursor-pointer group border-gray-3 first:border-t-0 hover:bg-gray-2 sm:border-t-0 sm:border-l sm:first:border-l-0 sm:p-5"
				>
					<span className="flex gap-2 justify-between items-center w-full text-sm text-gray-11">
						<span className="flex gap-2 items-center min-w-0">
							<FontAwesomeIcon icon={cell.icon} className="size-[13px] shrink-0 text-gray-10" />
							<span className="truncate">{cell.label}</span>
						</span>
						<FontAwesomeIcon icon={faChevronRight} className="transition-all duration-200 size-[10px] shrink-0 text-gray-8 group-hover:translate-x-0.5 group-hover:text-gray-11" />
					</span>
					<Reading value={cell.value} unit={cell.unit} detail={cell.detail} />
				</button>
			))}
		</Card>
	);
}

/** The full controls each card and reading opens. */
export function HomeSheets({ open, onClose }: { open: OpenSheet; onClose: () => void }) {
	const { state } = useHome();
	const plug = state?.plug.value ?? null;
	const bulb = state?.bulb.value ?? null;
	const hub = state?.hub.value ?? null;
	const door = state?.door.value ?? null;
	const motion = state?.motion.value ?? null;
	const climate = state?.climate.value ?? null;

	return (
		<>
			<Sheet open={open === "bulb"} title={bulb?.name ?? "Light"} subtitle={bulb?.model} onClose={onClose}>
				<BulbControls />
			</Sheet>
			<Sheet open={open === "plug"} title={plug?.name ?? "Plug"} subtitle={plug?.model} onClose={onClose}>
				<PlugControls />
			</Sheet>
			<Sheet open={open === "siren"} title="Siren" subtitle={hub ? `${hub.name}, ${hub.model}` : undefined} onClose={onClose}>
				<SirenControls />
			</Sheet>
			<Sheet open={open === "door"} title={door?.name ?? "Door"} subtitle={door ? `${door.model} contact sensor` : undefined} onClose={onClose}>
				<EventList events={door?.events ?? []} source={state?.door} />
			</Sheet>
			<Sheet open={open === "motion"} title={motion?.name ?? "Motion"} subtitle={motion ? `${motion.model} motion sensor` : undefined} onClose={onClose}>
				<EventList events={motion?.events ?? []} source={state?.motion} />
			</Sheet>
			<Sheet open={open === "climate"} title={climate?.name ?? "Climate"} subtitle={climate ? `${climate.model} temperature and humidity` : undefined} onClose={onClose}>
				<ClimateControls />
			</Sheet>
		</>
	);
}
