"use client";

import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReportCard } from "@/components/report-card";
import { formatInteger } from "@/components/formater";
import { useReport } from "@/hooks/use-report";
import {
	MODEL_ORDER,
	type ModelName,
	type NoveltyReport,
	type ValidationReport,
} from "@/lib/ids-api";

const LABELS: Record<ModelName, string> = {
	random_forest: "Random Forest",
	isolation_forest: "Isolation Forest",
	autoencoder: "Autoencoder",
};

const percent = (value: number | undefined) =>
	value === undefined ? "n/a" : `${(value * 100).toFixed(1)}%`;

/**
 * What happens on an attack the supervised model was never shown.
 *
 * This is the result that decides whether the project needs three models or
 * only the best one.
 */
export function NoveltyTable({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<NoveltyReport>("novelty");

	return (
		<ReportCard
			className={className}
			command="python -m ids.novelty"
			description="One attack family at a time is removed from training, all three models are refitted, and each is then asked about the family none of them was told about. The unsupervised models never see any attack during training, so only the supervised one is really being tested."
			id={id}
			report={report}
			title="Attacks nobody trained on"
		>
			{(data) => (
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Held out family</TableHead>
								<TableHead className="text-right">Flows</TableHead>
								{MODEL_ORDER.map((name) => (
									<TableHead className="text-right" key={name}>
										{LABELS[name]}
									</TableHead>
								))}
							</TableRow>
						</TableHeader>
						<TableBody>
							{data.results
								.filter((row) => !row.skipped)
								.map((row) => {
									const best = MODEL_ORDER.reduce<ModelName>(
										(winner, name) =>
											(row.recall_on_unseen?.[name] ?? 0) >
											(row.recall_on_unseen?.[winner] ?? 0)
												? name
												: winner,
										MODEL_ORDER[0]
									);
									return (
										<TableRow key={row.family}>
											<TableCell className="font-medium">
												{row.family}
											</TableCell>
											<TableCell className="text-right tabular-nums">
												{formatInteger(row.held_out_flows ?? 0)}
											</TableCell>
											{MODEL_ORDER.map((name) => (
												<TableCell
													className="text-right tabular-nums"
													key={name}
												>
													<span
														className={
															name === best ? "font-semibold" : undefined
														}
													>
														{percent(row.recall_on_unseen?.[name])}
													</span>
												</TableCell>
											))}
										</TableRow>
									);
								})}
						</TableBody>
					</Table>
				</div>
			)}
		</ReportCard>
	);
}

/**
 * How much a random split flatters the scores.
 *
 * A denial of service burst produces thousands of identical flows, so a random
 * split puts copies of the same row on both sides of the fence.
 */
export function ValidationTable({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<ValidationReport>("validation");

	return (
		<ReportCard
			className={className}
			command="python -m ids.validate"
			description="The same three models under a random split and under a split that trains on the earlier part of every capture session and tests on the later part."
			id={id}
			report={report}
			title="Does the split flatter the numbers"
		>
			{(data) => (
				<>
					<div className="mb-4 flex flex-wrap gap-3 text-xs">
						<Badge className="font-normal" variant="secondary">
							{formatInteger(data.duplicate_overlap.unique_flows)} distinct
							flows out of{" "}
							{formatInteger(data.duplicate_overlap.total_flows)}
						</Badge>
						<Badge className="font-normal" variant="secondary">
							{percent(data.duplicate_overlap.share_of_test_seen_in_train)} of a
							random test split has an identical twin in the train half
						</Badge>
						<Badge className="font-normal" variant="destructive">
							{percent(
								data.duplicate_overlap.share_of_test_attacks_seen_in_train
							)}{" "}
							of the test attacks do
						</Badge>
					</div>
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Model</TableHead>
									<TableHead className="text-right">Recall random</TableHead>
									<TableHead className="text-right">
										Recall time ordered
									</TableHead>
									<TableHead className="text-right">
										False positives random
									</TableHead>
									<TableHead className="text-right">
										False positives time ordered
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{MODEL_ORDER.map((name) => (
									<TableRow key={name}>
										<TableCell className="font-medium">
											{LABELS[name]}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(data.random_split[name]?.recall)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(data.time_ordered_split[name]?.recall)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(data.random_split[name]?.false_positive_rate)}
										</TableCell>
										<TableCell className="text-right tabular-nums">
											{percent(
												data.time_ordered_split[name]?.false_positive_rate
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				</>
			)}
		</ReportCard>
	);
}
