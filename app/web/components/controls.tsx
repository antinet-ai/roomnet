"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";

/**
 * A tall slider like a phone's brightness control. It follows the finger
 * while dragging and sends one value when let go, so the device receives
 * one change per gesture, not one per pixel.
 */
export function TallSlider({
	value,
	min,
	max,
	fill,
	label,
	disabled,
	onCommit,
}: {
	value: number;
	min: number;
	max: number;
	fill: string;
	label: string;
	disabled?: boolean;
	onCommit: (value: number) => void;
}) {
	const track = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState<number | null>(null);
	const shown = dragging ?? value;

	const valueAt = (clientY: number) => {
		const box = track.current?.getBoundingClientRect();
		if (!box) return value;
		const fraction = 1 - (clientY - box.top) / box.height;
		return Math.round(min + Math.min(1, Math.max(0, fraction)) * (max - min));
	};

	return (
		<div
			ref={track}
			role="slider"
			aria-label={label}
			aria-valuemin={min}
			aria-valuemax={max}
			aria-valuenow={shown}
			tabIndex={disabled ? -1 : 0}
			className={clsx(
				"overflow-hidden relative w-28 h-64 rounded-[32px] bg-gray-4 touch-none select-none",
				disabled ? "opacity-50" : "cursor-grab active:cursor-grabbing",
			)}
			onPointerDown={(event) => {
				if (disabled) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				setDragging(valueAt(event.clientY));
			}}
			onPointerMove={(event) => dragging !== null && setDragging(valueAt(event.clientY))}
			onPointerUp={() => {
				if (dragging !== null) onCommit(dragging);
				setDragging(null);
			}}
			onKeyDown={(event) => {
				if (disabled) return;
				const step = event.key === "ArrowUp" ? 5 : event.key === "ArrowDown" ? -5 : 0;
				if (step) onCommit(Math.min(max, Math.max(min, value + step)));
			}}
		>
			<div
				className="absolute inset-x-0 bottom-0 transition-[height] duration-75"
				style={{ height: `${((shown - min) / (max - min)) * 100}%`, background: fill }}
			/>
			<span className="absolute inset-x-0 bottom-4 text-sm font-medium text-center tabular-nums text-black/70 mix-blend-normal">
				{shown}%
			</span>
		</div>
	);
}

/**
 * A colour wheel: the angle is the hue and the distance from the centre the
 * saturation. Sends one colour when let go.
 */
export function ColourWheel({
	hue,
	saturation,
	disabled,
	onCommit,
}: {
	hue: number | null;
	saturation: number | null;
	disabled?: boolean;
	onCommit: (hue: number, saturation: number) => void;
}) {
	const wheel = useRef<HTMLDivElement>(null);
	const [dragging, setDragging] = useState<[number, number] | null>(null);
	const shown = dragging ?? (hue !== null && saturation !== null ? [hue, saturation] : null);

	const colourAt = (clientX: number, clientY: number): [number, number] => {
		const box = wheel.current?.getBoundingClientRect();
		if (!box) return [0, 100];
		const x = clientX - (box.left + box.width / 2);
		const y = clientY - (box.top + box.height / 2);
		const angle = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
		const distance = Math.min(1, Math.hypot(x, y) / (box.width / 2));
		return [Math.round(angle), Math.max(1, Math.round(distance * 100))];
	};

	const marker = shown
		? {
				left: `${50 + Math.sin((shown[0] * Math.PI) / 180) * (shown[1] / 2)}%`,
				top: `${50 - Math.cos((shown[0] * Math.PI) / 180) * (shown[1] / 2)}%`,
			}
		: null;

	return (
		<div
			ref={wheel}
			role="img"
			aria-label="Colour wheel"
			className={clsx(
				"relative mx-auto rounded-full aspect-square w-full max-w-[220px] touch-none select-none",
				disabled ? "opacity-50" : "cursor-crosshair",
			)}
			style={{
				background:
					"radial-gradient(circle closest-side, white, transparent), conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
			}}
			onPointerDown={(event) => {
				if (disabled) return;
				event.currentTarget.setPointerCapture(event.pointerId);
				setDragging(colourAt(event.clientX, event.clientY));
			}}
			onPointerMove={(event) => dragging && setDragging(colourAt(event.clientX, event.clientY))}
			onPointerUp={() => {
				if (dragging) onCommit(dragging[0], dragging[1]);
				setDragging(null);
			}}
		>
			{marker && shown && (
				<span
					className="absolute rounded-full border-[3px] border-white shadow-md -translate-x-1/2 -translate-y-1/2 size-7"
					style={{ ...marker, background: `hsl(${shown[0]} ${shown[1]}% 58%)` }}
				/>
			)}
		</div>
	);
}

/** A row of mutually exclusive choices, like a phone's segmented control. */
export function Segmented<T extends string | number>({
	options,
	value,
	onChange,
	label,
}: {
	options: { value: T; label: string }[];
	value: T;
	onChange: (value: T) => void;
	label: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="flex p-1 rounded-xl bg-gray-3">
			{options.map((option) => (
				<button
					key={String(option.value)}
					type="button"
					role="radio"
					aria-checked={option.value === value}
					onClick={() => onChange(option.value)}
					className={clsx(
						"flex-1 h-8 text-sm rounded-lg transition-all duration-200",
						option.value === value ? "bg-gray-1 shadow-sm text-gray-12 font-medium" : "text-gray-11 hover:text-gray-12",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}

/** One sentence under a control when the device refused, cleared on the next change. */
export function useDeviceAction(refresh: () => Promise<void>) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const run = async (call: () => Promise<void>) => {
		setBusy(true);
		setError(null);
		try {
			await call();
			await refresh();
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : "The device did not do it.");
		} finally {
			setBusy(false);
		}
	};
	return { busy, error, run };
}

/** Seconds left on a device's countdown, ticking between the agent's readings. */
export function useCountdown(seconds: number | null): number | null {
	const [left, setLeft] = useState(seconds);
	useEffect(() => {
		setLeft(seconds);
		if (seconds === null) return;
		const timer = window.setInterval(() => setLeft((value) => (value === null ? null : Math.max(0, value - 1))), 1000);
		return () => window.clearInterval(timer);
	}, [seconds]);
	return left;
}
