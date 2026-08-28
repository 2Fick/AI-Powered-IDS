"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { formatCompactNumber } from "@/components/formater";
import { fetchReplaySummary, type ReplaySummary } from "@/lib/ids-api";

/** What the replay stream is drawing from, shown at the foot of the sidebar. */
export function DatasetCard() {
	const [summary, setSummary] = useState<ReplaySummary | null>(null);

	useEffect(() => {
		fetchReplaySummary()
			.then(setSummary)
			.catch(() => setSummary(null));
	}, []);

	return (
		<div
			className={cn(
				"rounded-lg size-full min-h-24 border bg-background",
				"relative flex flex-col gap-1 overflow-hidden px-4 pt-3 pb-3 *:text-nowrap",
				"transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
			)}
		>
			<span className="font-light font-mono text-[10px] text-muted-foreground">
				REPLAY SOURCE
			</span>
			<p className="font-medium text-xs">CICIDS2017</p>
			<span className="text-[10px] text-muted-foreground">
				{summary
					? `${formatCompactNumber(summary.flows)} held out flows, ${formatCompactNumber(
							summary.attacks
						)} attacks`
					: "waiting for the API"}
			</span>
		</div>
	);
}
