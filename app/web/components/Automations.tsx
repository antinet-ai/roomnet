"use client";

import { faDoorOpen, faLightbulb } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Card } from "@/ui/Card";
import { Switch } from "@/ui/Switch";
import { useDeviceAction } from "./controls";
import { postJson, timeAgo, useHome } from "./useHome";

/** The automations a person can switch on; each is off until they do. */
export function Automations() {
	const { state, refresh } = useHome();
	const { busy, error, run } = useDeviceAction(refresh);
	const rule = state?.door_lights_off ?? null;
	const door = state?.door.value?.name ?? "the door";
	const bulb = state?.bulb.value?.name ?? "the light";

	return (
		<section className="flex flex-col gap-3">
			<h2 className="text-lg font-medium text-gray-12">Automations</h2>
			<Card className="flex flex-col gap-3">
				<div className="flex gap-4 items-center">
					<div className="flex items-center -space-x-2 shrink-0">
						<span className="flex justify-center items-center rounded-full ring-2 size-10 bg-gray-3 ring-gray-1 text-gray-11">
							<FontAwesomeIcon icon={faDoorOpen} className="size-[15px]" />
						</span>
						<span className="flex justify-center items-center rounded-full ring-2 size-10 bg-gray-3 ring-gray-1 text-gray-11">
							<FontAwesomeIcon icon={faLightbulb} className="size-[15px]" />
						</span>
					</div>
					<div className="flex flex-col flex-1 min-w-0">
						<p className="text-[15px] font-medium text-gray-12">When {door} opens</p>
						<p className="text-sm text-gray-10">
							Turn {bulb} off
							{rule?.last_run ? ` · last ran ${timeAgo(rule.last_run)}` : ""}
						</p>
					</div>
					<Switch
						checked={rule?.enabled ?? false}
						disabled={!rule || busy}
						onCheckedChange={(on) => run(() => postJson("/api/automations/door-lights-off", { on }))}
					/>
				</div>
				{(error ?? rule?.error) && <p className="text-sm text-red-500">{error ?? rule?.error}</p>}
			</Card>
		</section>
	);
}
