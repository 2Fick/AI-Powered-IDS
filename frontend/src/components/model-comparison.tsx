"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInteger } from "@/components/formater";
import {
	type BenchmarkReport,
	MODEL_ORDER,
	type ModelName,
	fetchBenchmark,
} from "@/lib/ids-api";

function percent(value: number, digits = 2): string {
	return `${(value * 100).toFixed(digits)}%`;
}

/**
 * The offline comparison of the three models on the held out test split.
 *
 * This is the table the whole project exists to produce, so it sits on the
 * dashboard rather than in a notebook. Every number comes from the API, which
 * reads the report written by the benchmark run.
 */
export function ModelComparison({ className, id }: { className?: string; id?: string }) {
	const [report, setReport] = useState<BenchmarkReport | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		fetchBenchmark()
			.then(setReport)
			.catch((cause: Error) => setError(cause.message));
	}, []);

	return (
		<Card className={cn("shadow-none lg:col-span-4 dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>Model comparison</CardTitle>
				<CardDescription>
					{report
						? `Measured on ${formatInteger(report.test_rows)} held out flows, ${formatInteger(
								report.test_attacks
							)} of them attacks. Both unsupervised models are thresholded at a ${percent(
								report.target_fpr,
								0
							)} target false positive rate.`
						: "Scores on the held out test split."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{error ? (
					<p className="text-muted-foreground text-sm">
						No benchmark report available yet ({error}). Run the benchmark and
						reload.
					</p>
				) : null}
				{!report && !error ? <Skeleton className="h-40 w-full" /> : null}
				{report ? (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Model</TableHead>
									<TableHead className="text-right">Recall</TableHead>
									<TableHead className="text-right">False positives</TableHead>
									<TableHead className="text-right">Precision</TableHead>
									<TableHead className="text-right">F1</TableHead>
									<TableHead className="text-right">ROC AUC</TableHead>
									<TableHead className="text-right">Latency p50</TableHead>
									<TableHead className="text-right">Latency p95</TableHead>
									<TableHead className="text-right">Missed attacks</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{MODEL_ORDER.map((name: ModelName) => {
									const row = report.models[name];
									if (!row) {
										return null;
									}
									return (
										<TableRow key={name}>
											<TableCell>
												<div className="flex flex-col gap-1">
													<span className="font-medium">{row.label}</span>
													<Badge
														className="w-fit font-normal"
														variant="secondary"
													>
														{row.kind}
													</Badge>
												</div>
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{percent(row.recall)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{percent(row.false_positive_rate)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{percent(row.precision)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{row.f1.toFixed(3)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{row.roc_auc.toFixed(3)}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{row.single_flow_latency.p50_ms.toFixed(2)} ms
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{row.single_flow_latency.p95_ms.toFixed(2)} ms
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{formatInteger(row.confusion.false_negative)}
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				) : null}
			</CardContent>
		</Card>
	);
}
