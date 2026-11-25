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
			<div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
				{series.map(([sensor, item]) => (
					<Card key={sensor}>
						<SeriesPanel series={item} />
					</Card>
				))}
			</div>
		</>
	);
}
