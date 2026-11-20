"use client";

import { faCamera, faLightbulb, faPlug, faTowerBroadcast, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useState } from "react";
import { PageTitle, SourceProblem } from "@/components/PageTitle";
import { postJson, type SourceState, timeAgo, useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";
import { Switch } from "@/ui/Switch";

function Status({ ok }: { ok: boolean }) {
	return (
		<span className="flex gap-1.5 items-center text-xs text-gray-10">
			<span className={ok ? "rounded-full size-2 bg-green-500" : "rounded-full size-2 bg-red-500"} />
			{ok ? "Connected" : "Not connected"}
		</span>
	);
}

function connected<T>(source: SourceState<T> | null | undefined): boolean {
	return Boolean(source?.value_time) && !source?.error;
}

function since<T>(source: SourceState<T> | null | undefined): string | null {
	return source?.value_time ? timeAgo(source.value_time) : null;
}

function DeviceHeader({ icon, name, detail, ok }: { icon: IconDefinition; name: string; detail: string; ok: boolean }) {
	return (
		<div className="flex gap-3 items-center">
			<div className="flex justify-center items-center rounded-lg size-9 bg-gray-3">
				<FontAwesomeIcon icon={icon} className="text-gray-12 size-[14px]" />
			</div>
			<div className="flex flex-col flex-1 min-w-0">
				<p className="text-sm font-medium truncate text-gray-12">{name}</p>
				<p className="text-xs text-gray-10">{detail}</p>
			</div>
			<Status ok={ok} />
		</div>
	);
}

type Switchable = { on: boolean; name: string; model: string };

/** A device a person switches on or off; the tap here is the only place it changes. */
function SwitchCard<T extends Switchable>({
	icon,
	fallbackName,
	path,
	source,
}: {
	icon: IconDefinition;
	fallbackName: string;
	path: string;
	source: SourceState<T> | null | undefined;
}) {
	const { refresh } = useHome();
	const [switching, setSwitching] = useState(false);
	const [switchError, setSwitchError] = useState<string | null>(null);
	const value = source?.value ?? null;

	const flip = async (on: boolean) => {
		setSwitching(true);
		setSwitchError(null);
		try {
			await postJson(path, { on });
			await refresh();
		} catch (failure) {
			setSwitchError(failure instanceof Error ? failure.message : `The ${fallbackName.toLowerCase()} did not switch.`);
		} finally {
			setSwitching(false);
		}
	};

	return (
		<Card className="flex flex-col gap-4">
			<DeviceHeader
				icon={icon}
				name={value?.name ?? fallbackName}
				detail={value ? `${value.model}, local API` : "Local API"}
				ok={connected(source)}
			/>
			<div className="flex justify-between items-center pt-4 border-t border-gray-3">
				<p className="text-sm text-gray-12">Power</p>
				<Switch checked={value?.on ?? false} disabled={!value || switching} onCheckedChange={flip} />
			</div>
			{switchError && <p className="text-sm text-red-500">{switchError}</p>}
			<SourceProblem error={source?.error ?? null} since={since(source)} />
		</Card>
	);
}

export default function Devices() {
	const { state } = useHome();
	const camera = state?.camera ?? null;
	const hub = state?.hub ?? null;
	const children: { what: string; source: SourceState<{ name: string; model: string }> | undefined }[] = [
		{ what: "Door", source: state?.door },
		{ what: "Motion", source: state?.motion },
		{ what: "Climate", source: state?.climate },
	];

	return (
		<>
			<PageTitle title="Devices" />
			<div className="flex flex-col gap-4 max-w-lg">
				<Card className="flex flex-col gap-4">
					<DeviceHeader
						icon={faCamera}
						name="Camera"
						detail={camera?.value ? `${camera.value.width} × ${camera.value.height}, RTSP` : "RTSP"}
						ok={connected(camera)}
					/>
					<SourceProblem error={camera?.error ?? null} since={since(camera)} />
				</Card>
				<SwitchCard icon={faPlug} fallbackName="Plug" path="/api/plug" source={state?.plug} />
				<SwitchCard icon={faLightbulb} fallbackName="Bulb" path="/api/bulb" source={state?.bulb} />
				<Card className="flex flex-col gap-4">
					<DeviceHeader
						icon={faTowerBroadcast}
						name={hub?.value?.name || "Hub"}
						detail={hub?.value ? `${hub.value.model}, local API` : "Local API"}
						ok={connected(hub)}
					/>
					<div className="flex flex-col gap-3 pt-4 border-t border-gray-3">
						{children.map(({ what, source }) => (
							<div key={what} className="flex flex-col gap-1">
								<div className="flex justify-between items-center">
									<p className="text-sm text-gray-12">
										{what}
										{source?.value ? <span className="text-gray-10"> · {source.value.name}, {source.value.model}</span> : null}
									</p>
									<Status ok={connected(source)} />
								</div>
								<SourceProblem error={source?.error ?? null} since={since(source)} />
							</div>
						))}
					</div>
					<SourceProblem error={hub?.error ?? null} since={since(hub)} />
				</Card>
			</div>
		</>
	);
}
