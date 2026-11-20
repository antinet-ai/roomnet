export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
	return (
		<div className="flex gap-4 justify-between items-center">
			<h1 className="text-2xl font-medium text-gray-12">{title}</h1>
			{children}
		</div>
	);
}

/** One plain sentence for a source that failed, with its last good value's age. */
export function SourceProblem({ error, since }: { error: string | null; since: string | null }) {
	if (!error) return null;
	return (
		<p className="text-sm text-gray-11">
			<span className="inline-block mr-2 align-middle rounded-full size-2 bg-red-500" />
			{error}
			{since ? ` Last good reading ${since}.` : ""}
		</p>
	);
}
