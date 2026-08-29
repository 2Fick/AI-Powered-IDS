"use client";

import { cn } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { StatusIndicator } from "@/components/indicator";
import { formatInteger } from "@/components/formater";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

function formatRate(value: number | null | undefined, digits = 2): string {
	if (value === null || value === undefined) {
		return "n/a";
	}
	return `${(value * 100).toFixed(digits)}%`;
}

export function DetectionStats({
	stream,
	className,
	id,
}: {
	stream: StreamSnapshot;
	className?: string;
	id?: string;
}) {
	const forest = stream.stats?.models.random_forest;
	const throughput = stream.stats?.actual_flows_per_second ?? 0;
	const alerts = forest?.alerts ?? 0;
	const missed = forest?.false_negative ?? 0;

	const cards = [
		{
			label: "Flows replayed",
			value: formatInteger(stream.stats?.processed ?? 0),
			footnote: `${throughput.toFixed(1)} flows per second`,
		},
		{
			label: "Alerts raised",
			value: formatInteger(alerts),
			footnote: "random forest, the deployed detector",
		},
		{
			label: "Attacks missed",
			value: formatInteger(missed),
			footnote: `recall ${formatRate(forest?.recall)}`,
		},
		{
			label: "False positive rate",
			value: formatRate(forest?.false_positive_rate),
			footnote: `decision in ${(forest?.mean_latency_ms ?? 0).toFixed(2)} ms`,
		},
	];

	return (
		<>
			{cards.map((card, index) => (
				<Card
					className={cn("shadow-none dark:ring-0", className)}
					id={index === 0 ? id : undefined}
					key={card.label}
				>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 font-normal text-muted-foreground text-xs">
							{card.label}
							{card.label === "Flows replayed" ? (
								<StatusIndicator
									color={stream.connection === "open" ? "emerald" : "rose"}
									pulse={stream.connection === "open"}
								/>
							) : null}
						</CardTitle>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<p className="font-semibold text-2xl tabular-nums">{card.value}</p>
						<p className="text-muted-foreground text-xs">{card.footnote}</p>
					</CardContent>
				</Card>
			))}
		</>
	);
}
