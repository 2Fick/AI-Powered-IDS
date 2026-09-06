"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { formatCompactNumber } from "@/components/formater";
import { fetchReplaySummary, type ReplaySummary } from "@/lib/ids-api";

/**
 * What the replay stream is drawing from.
 *
 * Kept to two lines: the sidebar has five pages to list and the footer was
 * pushing the last two below the fold.
 */
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
				"rounded-lg border bg-background px-3 py-2 *:text-nowrap",
				"transition-opacity group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0"
			)}
		>
			<p className="font-medium text-xs">CICIDS2017 replay</p>
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
