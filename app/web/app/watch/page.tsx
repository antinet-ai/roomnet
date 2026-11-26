"use client";

import { faClock, faLightbulb, faPlug, faSliders } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { moment } from "@/components/HomeParts";
import { PageTitle } from "@/components/PageTitle";
import { useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

// The watch asks roomnet every 3 seconds; three missed answers read as gone.
const SEEN_RECENTLY_MS = 10_000;

const WATCH_SUFFIX = " from the watch";

const controls = [
	{ icon: faLightbulb, text: "Switch the bulb on and off" },
	{ icon: faSliders, text: "Set the bulb's brightness" },
	{ icon: faPlug, text: "Switch the plug on and off, and see its power" },
];

function Status({ lastSeen }: { lastSeen: string | null }) {
	if (lastSeen && Date.now() - new Date(lastSeen).getTime() < SEEN_RECENTLY_MS) {
		return <span className="text-[13px] text-gray-10">Connected</span>;
	}
	return (
		<span className="flex gap-1.5 items-center text-[13px] text-gray-11">
			<span className="rounded-full size-2 bg-red-500" />
			{lastSeen ? `Seen ${moment(lastSeen)}` : "Not seen yet"}
		</span>
	);
}

function Setup() {
	return (
		<Card className="flex flex-col gap-3">
			<p className="text-sm font-medium text-gray-12">Pair a watch</p>
			<ol className="flex flex-col gap-2 pl-5 text-sm list-decimal text-gray-11">
				<li>
					Make a token with <code className="text-gray-12">openssl rand -hex 32</code> and put it in{" "}
					<code className="text-gray-12">app/site/devices.env</code> as <code className="text-gray-12">WATCH_TOKEN</code>.
				</li>
				<li>
					Put the same token, your WiFi and this Mac's address in <code className="text-gray-12">watch/src/secrets.h</code>, then flash the
					watch.
				</li>
				<li>Restart roomnet.</li>
			</ol>
		</Card>
	);
}

export default function Watch() {
	const { state } = useHome();
	const watch = state?.watch;
	const fromWatch = (state?.timeline ?? []).filter((item) => item.text.endsWith(WATCH_SUFFIX));

	return (
		<>
			<PageTitle title="Watch">
				{watch?.enabled && <p className="text-sm tabular-nums text-gray-10">Port {watch.port}</p>}
			</PageTitle>
			{state && !watch?.enabled ? (
				<Setup />
			) : (
				<>
					<Card className="flex gap-3 items-center px-4 py-3.5 sm:px-5">
						<span className="flex justify-center items-center rounded-lg size-9 shrink-0 bg-gray-3 text-gray-11">
							<FontAwesomeIcon icon={faClock} className="size-[14px]" />
						</span>
						<span className="flex flex-col flex-1 min-w-0">
							<span className="text-sm font-medium truncate text-gray-12">T-Watch S3</span>
							<span className="text-[13px] truncate text-gray-10">
								{watch?.address ? `Paired · ${watch.address}` : "Paired · waiting for its first call"}
							</span>
						</span>
						<Status lastSeen={watch?.last_seen ?? null} />
					</Card>
					<Card className="flex flex-col gap-3">
						<p className="text-sm font-medium text-gray-12">From your wrist</p>
						<ul className="flex flex-col gap-2.5">
							{controls.map((control) => (
								<li key={control.text} className="flex gap-2.5 items-center text-sm text-gray-11">
									<FontAwesomeIcon icon={control.icon} className="size-[13px] text-gray-10" />
									{control.text}
								</li>
							))}
						</ul>
					</Card>
					<Card className="flex flex-col gap-3">
						<p className="text-sm font-medium text-gray-12">Recent</p>
						{fromWatch.length === 0 ? (
							<p className="text-sm text-gray-10">Nothing done from the watch yet.</p>
						) : (
							<ul className="flex flex-col">
								{fromWatch.slice(0, 10).map((item) => (
									<li key={item.key} className="flex justify-between py-2 text-sm border-t border-gray-3 first:border-t-0">
										<span className="text-gray-12">{item.text.slice(0, -WATCH_SUFFIX.length)}</span>
										<span className="text-gray-10">{moment(item.time)}</span>
									</li>
								))}
							</ul>
						)}
					</Card>
				</>
			)}
		</>
	);
}
