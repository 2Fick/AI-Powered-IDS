"use client";

import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { formatInteger } from "@/components/formater";
import {
	type BenchmarkReport,
	MODEL_ORDER,
	type ModelName,
	fetchBenchmark,
} from "@/lib/ids-api";

const SHORT_LABELS: Record<ModelName, string> = {
	random_forest: "Random Forest",
	isolation_forest: "Isolation Forest",
	autoencoder: "Autoencoder",
};

function RecallBar({ recall }: { recall: number }) {
	const percentage = Math.round(recall * 100);
	const tone =
		recall >= 0.9
			? "bg-emerald-500"
			: recall >= 0.4
				? "bg-amber-500"
				: "bg-rose-500";
	return (
		<div className="flex items-center justify-end gap-2">
			<div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
				<div
					className={cn("h-full rounded-full", tone)}
					style={{ width: `${Math.max(percentage, recall > 0 ? 2 : 0)}%` }}
				/>
			</div>
			<span className="w-11 text-right tabular-nums">{percentage}%</span>
		</div>
	);
}

/**
 * Recall per attack family.
 *
 * The headline recall hides the interesting part. The supervised model wins
 * almost everywhere, but it is weakest exactly where the dataset has the
 * fewest labelled examples, and that is where the two unsupervised models
 * still have something to say.
 */
export function AttackCoverage({ className }: { className?: string }) {
	const [report, setReport] = useState<BenchmarkReport | null>(null);

	useEffect(() => {
		fetchBenchmark()
			.then(setReport)
			.catch(() => setReport(null));
	}, []);

	const rows = useMemo(() => {
		if (!report) {
			return [];
		}
		const families = report.models.random_forest.per_attack_recall;
		return Object.entries(families)
			.map(([name, entry]) => ({
				name,
				support: entry.support,
				recall: Object.fromEntries(
					MODEL_ORDER.map((model) => [
						model,
						report.models[model].per_attack_recall[name]?.recall ?? 0,
					])
				) as Record<ModelName, number>,
			}))
			.sort((left, right) => right.support - left.support);
	}, [report]);

	return (
		<Card className={cn("shadow-none lg:col-span-4 dark:ring-0", className)}>
			<CardHeader>
				<CardTitle>Coverage by attack family</CardTitle>
				<CardDescription>
					Share of each attack family the model catches, on the test split. The
					families at the bottom of the table are the rare ones, and they are
					where the supervised model has the least to learn from.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{rows.length === 0 ? (
					<Skeleton className="h-40 w-full" />
				) : (
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Attack family</TableHead>
									<TableHead className="text-right">Flows</TableHead>
									{MODEL_ORDER.map((model) => (
										<TableHead className="text-right" key={model}>
											{SHORT_LABELS[model]}
										</TableHead>
									))}
								</TableRow>
							</TableHeader>
							<TableBody>
								{rows.map((row) => (
									<TableRow key={row.name}>
										<TableCell className="font-medium">{row.name}</TableCell>
										<TableCell className="text-right tabular-nums">
											{formatInteger(row.support)}
										</TableCell>
										{MODEL_ORDER.map((model) => (
											<TableCell className="text-right" key={model}>
												<RecallBar recall={row.recall[model]} />
											</TableCell>
										))}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
