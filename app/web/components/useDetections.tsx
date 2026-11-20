"use client";

import { useEffect, useRef, useState } from "react";
import type { Detection } from "./useHome";

export type LiveDetection = Detection & { sequence: number };

/** Every detection as the agent pushes it, and how many arrived in the
 * last second, so boxes follow the video instead of a poll. */
export function useDetections() {
	const [detection, setDetection] = useState<LiveDetection | null>(null);
	const [perSecond, setPerSecond] = useState(0);
	const arrivals = useRef<number[]>([]);

	useEffect(() => {
		const source = new EventSource("/api/detections/stream");
		source.onmessage = (event) => {
			const now = performance.now();
			arrivals.current = [...arrivals.current.filter((time) => now - time < 1000), now];
			setDetection(JSON.parse(event.data) as LiveDetection);
			setPerSecond(arrivals.current.length);
		};
		const timer = window.setInterval(() => {
			const now = performance.now();
			arrivals.current = arrivals.current.filter((time) => now - time < 1000);
			setPerSecond(arrivals.current.length);
		}, 1000);
		return () => {
			source.close();
			window.clearInterval(timer);
		};
	}, []);

	return { detection, perSecond };
}
