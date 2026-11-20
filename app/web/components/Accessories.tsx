"use client";

import {
	faBell,
	faDoorClosed,
	faDoorOpen,
	faLightbulb,
	faPersonWalking,
	faPlug,
	faTemperatureHalf,
} from "@fortawesome/free-solid-svg-icons";
import { useState } from "react";
import { BulbControls, ClimateControls, EventList, PlugControls, SirenControls } from "./DeviceSheets";
import { Sheet } from "./Sheet";
import { Tile } from "./Tile";
import { bulbColour, timeAgo, useHome } from "./useHome";

type Open = "plug" | "bulb" | "siren" | "door" | "motion" | "climate" | null;

/** Every device as a tile; a tap opens its controls. */
export function Accessories() {
	const { state } = useHome();
	const [open, setOpen] = useState<Open>(null);
	const close = () => setOpen(null);
	const plug = state?.plug.value ?? null;
	const bulb = state?.bulb.value ?? null;
	const hub = state?.hub.value ?? null;
	const door = state?.door.value ?? null;
	const motion = state?.motion.value ?? null;
	const climate = state?.climate.value ?? null;
	const lastMotion = motion?.events[0]?.time ?? null;

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-lg font-medium text-gray-12">Accessories</h2>
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-6">
				<Tile
					icon={faLightbulb}
					name={bulb?.name ?? "Bulb"}
					state={bulb ? (bulb.on ? `${bulb.brightness}%` : "Off") : "–"}
					detail={bulb?.on ? (bulb.kelvin === null ? "Colour" : `${bulb.kelvin} K`) : undefined}
					active={Boolean(bulb?.on)}
					glow={bulb?.on ? bulbColour(bulb) : undefined}
					problem={Boolean(state?.bulb.error)}
					onOpen={() => setOpen("bulb")}
				/>
				<Tile
					icon={faPlug}
					name={plug?.name ?? "Plug"}
					state={plug ? (plug.on ? `${plug.watts.toFixed(1)} W` : "Off") : "–"}
					detail={plug?.timer ? `Timer set` : plug ? `${(plug.today_wh / 1000).toFixed(2)} kWh today` : undefined}
					active={Boolean(plug?.on)}
					problem={Boolean(state?.plug.error)}
					onOpen={() => setOpen("plug")}
				/>
				<Tile
					icon={faBell}
					name="Siren"
					state={hub ? (hub.in_alarm ? "Sounding" : "Quiet") : "–"}
					detail={hub?.name}
					active={Boolean(hub?.in_alarm)}
					problem={Boolean(state?.hub.error) || Boolean(hub?.in_alarm)}
					onOpen={() => setOpen("siren")}
				/>
				<Tile
					icon={door?.open ? faDoorOpen : faDoorClosed}
					name={door?.name ?? "Door"}
					state={door ? (door.open ? "Open" : "Closed") : "–"}
					detail={door?.events[0] ? timeAgo(door.events[0].time) : undefined}
					active={Boolean(door?.open)}
					problem={Boolean(state?.door.error)}
					onOpen={() => setOpen("door")}
				/>
				<Tile
					icon={faPersonWalking}
					name={motion?.name ?? "Motion"}
					state={motion ? (motion.detected ? "Motion" : "Clear") : "–"}
					detail={lastMotion ? `Last ${timeAgo(lastMotion)}` : undefined}
					active={Boolean(motion?.detected)}
					problem={Boolean(state?.motion.error)}
					onOpen={() => setOpen("motion")}
				/>
				<Tile
					icon={faTemperatureHalf}
					name={climate?.name ?? "Climate"}
					state={climate ? `${climate.temperature.toFixed(1)}°` : "–"}
					detail={climate ? `${climate.humidity.toFixed(0)}% humidity` : undefined}
					active={Boolean(climate)}
					problem={Boolean(state?.climate.error)}
					onOpen={() => setOpen("climate")}
				/>
			</div>
			<Sheet open={open === "bulb"} title={bulb?.name ?? "Bulb"} subtitle={bulb?.model} onClose={close}>
				<BulbControls />
			</Sheet>
			<Sheet open={open === "plug"} title={plug?.name ?? "Plug"} subtitle={plug?.model} onClose={close}>
				<PlugControls />
			</Sheet>
			<Sheet open={open === "siren"} title="Siren" subtitle={hub ? `${hub.name}, ${hub.model}` : undefined} onClose={close}>
				<SirenControls />
			</Sheet>
			<Sheet open={open === "door"} title={door?.name ?? "Door"} subtitle={door ? `${door.model} contact sensor` : undefined} onClose={close}>
				<EventList events={door?.events ?? []} source={state?.door} />
			</Sheet>
			<Sheet open={open === "motion"} title={motion?.name ?? "Motion"} subtitle={motion ? `${motion.model} motion sensor` : undefined} onClose={close}>
				<EventList events={motion?.events ?? []} source={state?.motion} />
			</Sheet>
			<Sheet open={open === "climate"} title={climate?.name ?? "Climate"} subtitle={climate ? `${climate.model} temperature and humidity` : undefined} onClose={close}>
				<ClimateControls />
			</Sheet>
		</section>
	);
}
