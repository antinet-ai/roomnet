"use client";

import clsx from "clsx";
import { useState } from "react";
import { DecisionCard } from "@/components/DecisionCard";
import { PageTitle } from "@/components/PageTitle";
import { useHome } from "@/components/useHome";

const filters = [
	{ key: "waiting", name: "Needs you" },
	{ key: "all", name: "All" },
] as const;

export default function Decisions() {
	const { decisions } = useHome();
	const [filter, setFilter] = useState<(typeof filters)[number]["key"]>("waiting");
	const shown = (decisions ?? []).filter((item) =>
		filter === "all" ? true : item.to_person && item.action === null,
	);

	return (
		<>
			<PageTitle title="Decisions">
				<div className="flex p-1 rounded-md border border-gray-4 bg-gray-1">
					{filters.map((option) => (
						<button
							key={option.key}
							type="button"
							onClick={() => setFilter(option.key)}
							className={clsx(
								"px-3 h-8 text-[13px] rounded transition-colors duration-200",
								filter === option.key ? "bg-gray-3 text-gray-12" : "text-gray-10 hover:text-gray-12",
							)}
						>
							{option.name}
						</button>
					))}
				</div>
			</PageTitle>
			{shown.length === 0 ? (
				<p className="text-[15px] text-gray-10">
					{filter === "waiting" ? "Nothing is waiting for you." : "No decisions yet."}
				</p>
			) : (
				<div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
					{shown.map((decision) => (
						<DecisionCard key={decision.id} decision={decision} />
					))}
				</div>
			)}
		</>
	);
}
