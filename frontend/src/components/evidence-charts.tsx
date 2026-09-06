"use client";

import { useState } from "react";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	ReferenceLine,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ReportCard } from "@/components/report-card";
import { useReport } from "@/hooks/use-report";
import {
	type CurvesReport,
	MODEL_COLORS,
	MODEL_ORDER,
	type ModelName,
} from "@/lib/ids-api";

const CURVES_COMMAND = "python -m ids.curves";

const MODEL_CONFIG = {
	random_forest: { label: "Random Forest", color: MODEL_COLORS.random_forest },
	isolation_forest: {
		label: "Isolation Forest",
		color: MODEL_COLORS.isolation_forest,
	},
	autoencoder: { label: "Autoencoder", color: MODEL_COLORS.autoencoder },
} satisfies ChartConfig;

/**
 * The three ROC curves on one pair of axes.
 *
 * The comparison table gives one operating point per model. This is the whole
 * trade off, and it is the chart that shows the two unsupervised models are
 * far from useless even though their chosen point looks poor.
 */
export function RocCurvesChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<CurvesReport>("curves");

	return (
		<ReportCard
			className={className}
			command={CURVES_COMMAND}
			description="True positives against false positives across every possible threshold. The diagonal is what guessing would give."
			id={id}
			report={report}
			title="ROC curves"
		>
			{(data) => {
				// One row per sampled false positive rate, with each model's true
				// positive rate on it, so a single chart can draw all three.
				const grid = Array.from({ length: 100 }, (_, index) => index / 99);
				const rows = grid.map((fpr) => {
					const row: Record<string, number> = { fpr: Number(fpr.toFixed(3)) };
					for (const name of MODEL_ORDER) {
						const curve = data.models[name].roc;
						const point =
							curve.find((candidate) => candidate.fpr >= fpr) ??
							curve[curve.length - 1];
						row[name] = Number(point.tpr.toFixed(4));
					}
					return row;
				});

				return (
					<>
						<ChartContainer
							className="aspect-video w-full"
							config={MODEL_CONFIG}
						>
							<LineChart accessibilityLayer data={rows}>
								<CartesianGrid />
								<XAxis
									axisLine={false}
									dataKey="fpr"
									label={{
										value: "false positive rate",
										position: "insideBottom",
										offset: -4,
									}}
									tickLine={false}
									tickMargin={8}
									type="number"
								/>
								<YAxis
									axisLine={false}
									domain={[0, 1]}
									tickLine={false}
									tickMargin={8}
									width={44}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<ReferenceLine
									segment={[
										{ x: 0, y: 0 },
										{ x: 1, y: 1 },
									]}
									stroke="var(--muted-foreground)"
									strokeDasharray="3 3"
								/>
								{MODEL_ORDER.map((name) => (
									<Line
										dataKey={name}
										dot={false}
										isAnimationActive={false}
										key={name}
										stroke={`var(--color-${name})`}
										strokeWidth={2}
										type="monotone"
									/>
								))}
							</LineChart>
						</ChartContainer>
						<div className="mt-3 flex flex-wrap gap-4 text-muted-foreground text-xs">
							{MODEL_ORDER.map((name) => (
								<span key={name}>
									{data.models[name].label}: area {data.models[name].roc_auc.toFixed(3)}
								</span>
							))}
						</div>
					</>
				);
			}}
		</ReportCard>
	);
}

/**
 * Recall against false positive rate as the threshold moves.
 *
 * This is the chart that answers "why that threshold". The chosen point is
 * marked, and the slope either side of it shows what tightening or loosening
 * the alert would actually cost.
 */
export function ThresholdTradeoffChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<CurvesReport>("curves");
	const [model, setModel] = useState<ModelName>("autoencoder");

	const config = {
		recall: { label: "Recall", color: MODEL_COLORS.random_forest },
		false_positive_rate: {
			label: "False positive rate",
			color: MODEL_COLORS.autoencoder,
		},
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={CURVES_COMMAND}
			description="What moving the alert threshold costs and buys. Both lines are read against the same threshold on the horizontal axis."
			id={id}
			report={report}
			title="Threshold trade off"
		>
			{(data) => {
				const sweep = data.models[model].threshold_sweep;
				const rows = sweep.points.map((point, index) => ({
					step: index,
					recall: Number((point.recall * 100).toFixed(2)),
					false_positive_rate: Number(
						(point.false_positive_rate * 100).toFixed(3)
					),
					chosen: point.chosen,
				}));
				const chosenAt = rows.find((row) => row.chosen)?.step;

				return (
					<>
						<div className="mb-3">
							<Select
								onValueChange={(value) => setModel(value as ModelName)}
								value={model}
							>
								<SelectTrigger
									aria-label="Model"
									className="w-full sm:w-56"
									size="sm"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="start">
									{MODEL_ORDER.map((name) => (
										<SelectItem key={name} value={name}>
											{data.models[name].label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<ChartContainer className="aspect-video w-full" config={config}>
							<LineChart accessibilityLayer data={rows}>
								<CartesianGrid vertical={false} />
								<XAxis
									axisLine={false}
									dataKey="step"
									label={{
										value: "threshold, loose to strict",
										position: "insideBottom",
										offset: -4,
									}}
									tickLine={false}
									tickMargin={8}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tickMargin={8}
									unit="%"
									width={52}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								{chosenAt !== undefined ? (
									<ReferenceLine
										label={{
											value: "in use",
											fill: "var(--muted-foreground)",
											fontSize: 11,
											position: "top",
										}}
										stroke="var(--muted-foreground)"
										strokeDasharray="4 3"
										x={chosenAt}
									/>
								) : null}
								<Line
									dataKey="recall"
									dot={false}
									isAnimationActive={false}
									stroke="var(--color-recall)"
									strokeWidth={2}
									type="monotone"
								/>
								<Line
									dataKey="false_positive_rate"
									dot={false}
									isAnimationActive={false}
									stroke="var(--color-false_positive_rate)"
									strokeWidth={2}
									type="monotone"
								/>
							</LineChart>
						</ChartContainer>
					</>
				);
			}}
		</ReportCard>
	);
}

/**
 * Where benign and attack scores sit for one model.
 *
 * Two distributions that sit on top of each other is a model that cannot
 * separate the classes at any threshold, and no single metric makes that as
 * obvious as seeing them overlap.
 */
export function ScoreSeparationChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<CurvesReport>("curves");
	const [model, setModel] = useState<ModelName>("autoencoder");

	const config = {
		benign: { label: "Benign", color: MODEL_COLORS.random_forest },
		attack: { label: "Attack", color: "var(--chart-4)" },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={CURVES_COMMAND}
			description="Share of flows landing on each score. Both curves are normalised, because benign traffic outnumbers attacks four to one and would otherwise flatten the attack curve to nothing."
			id={id}
			report={report}
			title="Score separation"
		>
			{(data) => {
				const histogram = data.models[model].score_histogram;
				const rows = histogram.bins.map((bin) => ({
					score: Number(bin.score.toPrecision(3)),
					benign: Number((bin.benign * 100).toFixed(3)),
					attack: Number((bin.attack * 100).toFixed(3)),
				}));

				return (
					<>
						<div className="mb-3">
							<Select
								onValueChange={(value) => setModel(value as ModelName)}
								value={model}
							>
								<SelectTrigger
									aria-label="Model"
									className="w-full sm:w-56"
									size="sm"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="start">
									{MODEL_ORDER.map((name) => (
										<SelectItem key={name} value={name}>
											{data.models[name].label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<ChartContainer className="aspect-video w-full" config={config}>
							<AreaChart accessibilityLayer data={rows}>
								<CartesianGrid vertical={false} />
								<XAxis
									axisLine={false}
									dataKey="score"
									label={{
										value: "anomaly score",
										position: "insideBottom",
										offset: -4,
									}}
									minTickGap={32}
									tickLine={false}
									tickMargin={8}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tickMargin={8}
									unit="%"
									width={52}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<ReferenceLine
									label={{
										value: "threshold",
										fill: "var(--muted-foreground)",
										fontSize: 11,
										position: "top",
									}}
									stroke="var(--muted-foreground)"
									strokeDasharray="4 3"
									x={Number(histogram.chosen_threshold.toPrecision(3))}
								/>
								<Area
									dataKey="benign"
									fill="var(--color-benign)"
									fillOpacity={0.2}
									isAnimationActive={false}
									stroke="var(--color-benign)"
									type="monotone"
								/>
								<Area
									dataKey="attack"
									fill="var(--color-attack)"
									fillOpacity={0.2}
									isAnimationActive={false}
									stroke="var(--color-attack)"
									type="monotone"
								/>
							</AreaChart>
						</ChartContainer>
					</>
				);
			}}
		</ReportCard>
	);
}

/** How much the forest leans on each measurement. */
export function FeatureImportanceChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<CurvesReport>("curves");

	const config = {
		importance: { label: "Importance", color: MODEL_COLORS.random_forest },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={CURVES_COMMAND}
			description="The measurements the random forest actually splits on, out of 69. A short list carries most of the decision."
			id={id}
			report={report}
			title="What the forest looks at"
		>
			{(data) => {
				const rows = data.feature_importances.slice(0, 12).map((row) => ({
					feature: row.feature,
					importance: Number((row.importance * 100).toFixed(2)),
				}));
				return (
					<ChartContainer className="aspect-[4/3] w-full" config={config}>
						<BarChart accessibilityLayer data={rows} layout="vertical">
							<CartesianGrid horizontal={false} />
							<XAxis
								axisLine={false}
								tickLine={false}
								tickMargin={8}
								type="number"
								unit="%"
							/>
							<YAxis
								axisLine={false}
								dataKey="feature"
								tickLine={false}
								tickMargin={8}
								type="category"
								width={168}
							/>
							<ChartTooltip content={<ChartTooltipContent hideLabel />} />
							<Bar
								dataKey="importance"
								fill="var(--color-importance)"
								isAnimationActive={false}
								radius={4}
							/>
						</BarChart>
					</ChartContainer>
				);
			}}
		</ReportCard>
	);
}

/**
 * Benign against attack for the measurements that carry the signal.
 *
 * Drawn on a log scale, because these columns span nine orders of magnitude
 * and a linear axis shows one spike and nothing else.
 */
export function FeatureDistributionChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<CurvesReport>("curves");
	const [feature, setFeature] = useState<string | null>(null);

	const config = {
		benign: { label: "Benign", color: MODEL_COLORS.random_forest },
		attack: { label: "Attack", color: "var(--chart-4)" },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={CURVES_COMMAND}
			description="Where benign and attack traffic sit on the measurements that matter most. The horizontal axis is a base ten logarithm, since these columns span nine orders of magnitude."
			id={id}
			report={report}
			title="Feature distributions"
		>
			{(data) => {
				const chosen =
					data.feature_distributions.find(
						(entry) => entry.feature === feature
					) ?? data.feature_distributions[0];
				const rows = chosen.bins.map((bin) => ({
					value: Number(bin.value.toFixed(2)),
					benign: Number((bin.benign * 100).toFixed(3)),
					attack: Number((bin.attack * 100).toFixed(3)),
				}));

				return (
					<>
						<div className="mb-3">
							<Select
								onValueChange={setFeature}
								value={chosen.feature}
							>
								<SelectTrigger
									aria-label="Feature"
									className="w-full sm:w-72"
									size="sm"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent align="start">
									{data.feature_distributions.map((entry) => (
										<SelectItem key={entry.feature} value={entry.feature}>
											{entry.feature}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<ChartContainer className="aspect-video w-full" config={config}>
							<AreaChart accessibilityLayer data={rows}>
								<CartesianGrid vertical={false} />
								<XAxis
									axisLine={false}
									dataKey="value"
									label={{
										value: "log10 of the value",
										position: "insideBottom",
										offset: -4,
									}}
									minTickGap={32}
									tickLine={false}
									tickMargin={8}
								/>
								<YAxis
									axisLine={false}
									tickLine={false}
									tickMargin={8}
									unit="%"
									width={52}
								/>
								<ChartTooltip content={<ChartTooltipContent />} />
								<Area
									dataKey="benign"
									fill="var(--color-benign)"
									fillOpacity={0.2}
									isAnimationActive={false}
									stroke="var(--color-benign)"
									type="monotone"
								/>
								<Area
									dataKey="attack"
									fill="var(--color-attack)"
									fillOpacity={0.2}
									isAnimationActive={false}
									stroke="var(--color-attack)"
									type="monotone"
								/>
							</AreaChart>
						</ChartContainer>
						<p className="mt-3 text-muted-foreground text-xs">
							Median for benign traffic {chosen.benign_median.toLocaleString()},
							for attacks {chosen.attack_median.toLocaleString()}.
						</p>
					</>
				);
			}}
		</ReportCard>
	);
}
