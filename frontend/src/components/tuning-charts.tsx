"use client";

import {
	Bar,
	BarChart,
	CartesianGrid,
	Line,
	LineChart,
	XAxis,
	YAxis,
} from "recharts";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { ReportCard } from "@/components/report-card";
import { useReport } from "@/hooks/use-report";
import { MODEL_COLORS, type SweepReport } from "@/lib/ids-api";

const SWEEP_COMMAND = "python -m ids.sweep";

const percent = (value: number) => Number((value * 100).toFixed(2));

/**
 * Recall against the number of trees, with what those trees cost per flow.
 *
 * The interesting part is that the two lines do not agree: recall is flat from
 * a handful of trees onward while latency climbs with every one added.
 */
export function ForestSizeChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<SweepReport>("sweeps");

	const config = {
		recall: { label: "Recall", color: MODEL_COLORS.random_forest },
		latency: { label: "Latency", color: MODEL_COLORS.autoencoder },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={SWEEP_COMMAND}
			description="What each extra tree buys, and what it costs per flow. Recall flattens long before the latency does."
			id={id}
			report={report}
			title="Random forest, number of trees"
		>
			{(data) => {
				const rows = data.random_forest_trees.map((row) => ({
					trees: String(row.n_estimators),
					recall: percent(row.recall),
					latency: Number(row.latency_ms.toFixed(2)),
				}));
				return (
					<ChartContainer className="h-52 w-full" config={config}>
						<LineChart accessibilityLayer data={rows}>
							<CartesianGrid vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="trees"
								label={{ value: "trees", position: "insideBottom", offset: -4 }}
								tickLine={false}
								tickMargin={8}
							/>
							<YAxis
								axisLine={false}
								domain={[99, 100]}
								label={{
									value: "recall",
									angle: -90,
									position: "insideLeft",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								unit="%"
								width={64}
								yAxisId="recall"
							/>
							<YAxis
								axisLine={false}
								label={{
									value: "latency per flow",
									angle: 90,
									position: "insideRight",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								orientation="right"
								tickLine={false}
								tickMargin={8}
								unit=" ms"
								width={76}
								yAxisId="latency"
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Line
								dataKey="recall"
								isAnimationActive={false}
								stroke="var(--color-recall)"
								strokeWidth={2}
								type="monotone"
								yAxisId="recall"
							/>
							<Line
								dataKey="latency"
								isAnimationActive={false}
								stroke="var(--color-latency)"
								strokeDasharray="4 3"
								strokeWidth={2}
								type="monotone"
								yAxisId="latency"
							/>
						</LineChart>
					</ChartContainer>
				);
			}}
		</ReportCard>
	);
}

/**
 * Recall against how many flows each isolation tree is allowed to look at.
 *
 * This is the setting the scikit-learn default gets wrong for this data, and
 * the curve is the evidence.
 */
export function IsolationSamplesChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<SweepReport>("sweeps");

	const config = {
		recall: { label: "Recall", color: MODEL_COLORS.isolation_forest },
		auc: { label: "ROC AUC", color: MODEL_COLORS.random_forest },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={SWEEP_COMMAND}
			description="Samples each tree is fitted on. The library default of 256 is the leftmost useful point, and it is far from the best one."
			id={id}
			report={report}
			title="Isolation forest, samples per tree"
		>
			{(data) => {
				const rows = data.isolation_forest_samples.map((row) => ({
					samples: String(row.max_samples),
					recall: percent(row.recall),
					auc: percent(row.roc_auc),
				}));
				return (
					<ChartContainer className="h-52 w-full" config={config}>
						<LineChart accessibilityLayer data={rows}>
							<CartesianGrid vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="samples"
								label={{
									value: "samples per tree",
									position: "insideBottom",
									offset: -4,
								}}
								tickLine={false}
								tickMargin={8}
							/>
							<YAxis
								axisLine={false}
								label={{
									value: "recall and area under the curve",
									angle: -90,
									position: "insideLeft",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								unit="%"
								width={72}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Line
								dataKey="auc"
								isAnimationActive={false}
								stroke="var(--color-auc)"
								strokeDasharray="4 3"
								strokeWidth={2}
								type="monotone"
							/>
							<Line
								dataKey="recall"
								isAnimationActive={false}
								stroke="var(--color-recall)"
								strokeWidth={2}
								type="monotone"
							/>
						</LineChart>
					</ChartContainer>
				);
			}}
		</ReportCard>
	);
}

/**
 * Training loss and detection recall, epoch by epoch.
 *
 * The loss keeps falling after the recall has stopped moving, which is the
 * reason to measure both. Training longer makes the reconstruction better
 * without making the detector better.
 */
export function LearningCurveChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<SweepReport>("sweeps");

	const config = {
		loss: { label: "Training loss", color: MODEL_COLORS.autoencoder },
		recall: { label: "Recall", color: MODEL_COLORS.isolation_forest },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={SWEEP_COMMAND}
			description="Reconstruction loss on benign traffic against recall on attacks, after every epoch. Two different questions, and they stop improving at different times."
			id={id}
			report={report}
			title="Autoencoder, training curve"
		>
			{(data) => {
				const rows = data.autoencoder_learning_curve.map((row) => ({
					epoch: String(row.epoch),
					loss: Number(row.loss.toFixed(5)),
					recall: percent(row.recall),
				}));
				return (
					<ChartContainer className="h-52 w-full" config={config}>
						<LineChart accessibilityLayer data={rows}>
							<CartesianGrid vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="epoch"
								label={{ value: "epoch", position: "insideBottom", offset: -4 }}
								tickLine={false}
								tickMargin={8}
							/>
							<YAxis
								axisLine={false}
								label={{
									value: "reconstruction loss",
									angle: -90,
									position: "insideLeft",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								width={76}
								yAxisId="loss"
							/>
							<YAxis
								axisLine={false}
								label={{
									value: "recall on attacks",
									angle: 90,
									position: "insideRight",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								orientation="right"
								tickLine={false}
								tickMargin={8}
								unit="%"
								width={72}
								yAxisId="recall"
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Line
								dataKey="loss"
								isAnimationActive={false}
								stroke="var(--color-loss)"
								strokeWidth={2}
								type="monotone"
								yAxisId="loss"
							/>
							<Line
								dataKey="recall"
								isAnimationActive={false}
								stroke="var(--color-recall)"
								strokeDasharray="4 3"
								strokeWidth={2}
								type="monotone"
								yAxisId="recall"
							/>
						</LineChart>
					</ChartContainer>
				);
			}}
		</ReportCard>
	);
}

/** Recall against how narrow the autoencoder bottleneck is. */
export function LatentSizeChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<SweepReport>("sweeps");

	const config = {
		recall: { label: "Recall", color: MODEL_COLORS.autoencoder },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={SWEEP_COMMAND}
			description="How much the network is allowed to remember. Too wide and it learns to rebuild attacks too, too narrow and it rebuilds nothing well."
			id={id}
			report={report}
			title="Autoencoder, bottleneck size"
		>
			{(data) => {
				const rows = data.autoencoder_latent_dim.map((row) => ({
					latent: String(row.latent_dim),
					recall: percent(row.recall),
				}));
				return (
					<ChartContainer className="h-52 w-full" config={config}>
						<BarChart accessibilityLayer data={rows}>
							<CartesianGrid vertical={false} />
							<XAxis
								axisLine={false}
								dataKey="latent"
								label={{
									value: "latent dimensions",
									position: "insideBottom",
									offset: -4,
								}}
								tickLine={false}
								tickMargin={8}
							/>
							<YAxis
								axisLine={false}
								label={{
									value: "recall on attacks",
									angle: -90,
									position: "insideLeft",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								unit="%"
								width={64}
							/>
							<ChartTooltip content={<ChartTooltipContent hideLabel />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Bar
								dataKey="recall"
								fill="var(--color-recall)"
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
