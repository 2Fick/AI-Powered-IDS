"use client";

import { cn } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatInteger } from "@/components/formater";
import { MODEL_ORDER, type ModelName } from "@/lib/ids-api";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

const LABELS: Record<ModelName, string> = {
	random_forest: "Random Forest",
	isolation_forest: "Isolation Forest",
	autoencoder: "Autoencoder",
};

function percent(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "n/a";
	}
	return `${(value * 100).toFixed(2)}%`;
}

/**
 * The same metrics as the offline benchmark, recomputed from the flows that
 * have actually gone past on this connection. Watching the two agree is a good
 * sanity check that the served models are the ones that were measured.
 */
export function LiveScoreboard({
	stream,
	className,
	id,
}: {
	stream: StreamSnapshot;
	className?: string;
	id?: string;
}) {
	const models = stream.stats?.models;

	return (
		<Card className={cn("shadow-none lg:col-span-2 dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>Running scoreboard</CardTitle>
				<CardDescription>
					Recomputed from the {formatInteger(stream.stats?.processed ?? 0)}{" "}
					flows replayed on this connection, not read from the benchmark.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Model</TableHead>
								<TableHead className="text-right">Recall</TableHead>
								<TableHead className="text-right">False positives</TableHead>
								<TableHead className="text-right">Precision</TableHead>
								<TableHead className="text-right">Caught</TableHead>
								<TableHead className="text-right">Missed</TableHead>
								<TableHead className="text-right">Latency</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{MODEL_ORDER.map((name: ModelName) => {
								const row = models?.[name];
								return (
									<TableRow key={name}>
										<TableCell className="font-medium">{LABELS[name]}</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(row?.recall)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(row?.false_positive_rate)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(row?.precision)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatInteger(row?.true_positive ?? 0)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatInteger(row?.false_negative ?? 0)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{row?.mean_latency_ms
												? `${row.mean_latency_ms.toFixed(2)} ms`
												: "n/a"}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
