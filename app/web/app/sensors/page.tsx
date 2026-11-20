"use client";

import { PageTitle } from "@/components/PageTitle";
import { SeriesPanel } from "@/components/SeriesPanel";
import { useHome } from "@/components/useHome";
import { Card } from "@/ui/Card";

export default function Sensors() {
	const { state } = useHome();
	const series = Object.entries(state?.series ?? {});

	return (
		<>
			<PageTitle title="Sensors" />
			<p className="text-sm text-gray-11 max-w-2xl">
				Each sensor is judged by the same task against its own usual pattern, learned from its first 513 readings.
			</p>
			<div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
				{series.map(([sensor, item]) => (
					<Card key={sensor}>
						<SeriesPanel series={item} />
					</Card>
				))}
			</div>
		</>
	);
}
