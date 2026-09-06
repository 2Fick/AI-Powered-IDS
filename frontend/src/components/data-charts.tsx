"use client";

import {
	Bar,
	BarChart,
	CartesianGrid,
	LabelList,
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ReportCard } from "@/components/report-card";
import { formatInteger } from "@/components/formater";
import { useReport } from "@/hooks/use-report";
import { MODEL_COLORS } from "@/lib/ids-api";

const DATA_COMMAND = "python -m ids.data.explore --out reports";

export type DatasetReport = {
	total_flows: number;
	labelled_flows: number;
	padding_rows: number;
	sessions: {
		session: string;
		flows: number;
		attacks: number;
		benign: number;
		attack_share: number;
		families: string;
	}[];
	families: { family: string; flows: number; share: number }[];
	splits: Record<string, { rows: number; attacks: number }>;
	skew: {
		feature: string;
		median: number;
		p99: number;
		max: number;
		max_over_p99: number;
	}[];
	top_attack_sources: { ip: string; flows: number }[];
	cleaning: {
		infinite_values: number;
		negative_durations: number;
		constant_columns: string[];
		feature_columns_before_pruning: number;
	};
};

const BENIGN = "var(--chart-1)";
const ATTACK = "var(--chart-4)";

/**
 * Shorten a capture session name to something an axis can hold.
 *
 * The raw names run to thirty characters, wrap onto two lines and end up
 * unreadable stacked eight deep.
 */
function shortSessionName(session: string): string {
	const day = session.slice(0, 3);
	if (session.includes("WebAttacks")) {
		return `${day} am, web`;
	}
	if (session.includes("Infilteration")) {
		return `${day} pm, infil`;
	}
	if (session.includes("PortScan")) {
		return `${day} pm, scan`;
	}
	if (session.includes("DDos")) {
		return `${day} pm, DDoS`;
	}
	if (session.includes("Morning")) {
		return `${day} am`;
	}
	return day;
}

/** Benign against attack traffic in each of the eight capture sessions. */
export function SessionMixChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<DatasetReport>("dataset");

	const config = {
		benign: { label: "Benign", color: BENIGN },
		attacks: { label: "Attacks", color: ATTACK },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={DATA_COMMAND}
			description="The capture runs Monday to Friday. Monday is benign only, and the attack share swings from nothing to well over half, which is what makes a strictly chronological replay a poor demo."
			id={id}
			report={report}
			title="Traffic by capture session"
		>
			{(data) => {
				const rows = data.sessions.map((row) => ({
					session: shortSessionName(row.session),
					benign: row.benign,
					attacks: row.attacks,
				}));
				return (
					<ChartContainer className="h-72 w-full" config={config}>
						<BarChart accessibilityLayer data={rows} layout="vertical">
							<CartesianGrid horizontal={false} />
							<XAxis
								axisLine={false}
								label={{
									value: "flows",
									position: "insideBottom",
									offset: -4,
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								type="number"
							/>
							<YAxis
								axisLine={false}
								dataKey="session"
								label={{
									value: "capture session",
									angle: -90,
									position: "insideLeft",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								type="category"
								width={112}
							/>
							<ChartTooltip content={<ChartTooltipContent />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Bar
								dataKey="benign"
								fill="var(--color-benign)"
								isAnimationActive={false}
								radius={[0, 0, 0, 0]}
								stackId="flows"
							/>
							<Bar
								dataKey="attacks"
								fill="var(--color-attacks)"
								isAnimationActive={false}
								radius={[0, 3, 3, 0]}
								stackId="flows"
							/>
						</BarChart>
					</ChartContainer>
				);
			}}
		</ReportCard>
	);
}

/**
 * How far the largest value of each feature sits above the bulk of the data.
 *
 * This is the chart behind the choice of scaler. A maximum nine thousand times
 * the 99th percentile is what makes plain standardisation useless here.
 */
export function FeatureSkewChart({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<DatasetReport>("dataset");

	const config = {
		ratio: { label: "Max over p99", color: MODEL_COLORS.autoencoder },
	} satisfies ChartConfig;

	return (
		<ReportCard
			className={className}
			command={DATA_COMMAND}
			description="The largest value of each feature, divided by its 99th percentile. A handful of flows sit thousands of times above everything else, which is why the pipeline compresses with a signed logarithm before standardising."
			id={id}
			report={report}
			title="How heavy the tails are"
		>
			{(data) => {
				const rows = data.skew.map((row) => ({
					feature: row.feature,
					ratio: Math.round(row.max_over_p99),
				}));
				return (
					<ChartContainer className="h-72 w-full" config={config}>
						<BarChart accessibilityLayer data={rows} layout="vertical">
							<CartesianGrid horizontal={false} />
							<XAxis
								axisLine={false}
								label={{
									value: "times above the 99th percentile",
									position: "insideBottom",
									offset: -4,
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								type="number"
							/>
							<YAxis
								axisLine={false}
								dataKey="feature"
								label={{
									value: "feature",
									angle: -90,
									position: "insideLeft",
									style: { fill: "var(--muted-foreground)", fontSize: 11 },
								}}
								tickLine={false}
								tickMargin={8}
								type="category"
								width={192}
							/>
							<ChartTooltip content={<ChartTooltipContent hideLabel />} />
							<ChartLegend content={<ChartLegendContent />} />
							<Bar
								dataKey="ratio"
								fill="var(--color-ratio)"
								isAnimationActive={false}
								radius={3}
							>
								<LabelList
									className="fill-muted-foreground"
									dataKey="ratio"
									fontSize={10}
									position="right"
								/>
							</Bar>
						</BarChart>
					</ChartContainer>
				);
			}}
		</ReportCard>
	);
}

/** What the cleaning step removes, and what the splits end up holding. */
export function PipelineSummary({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<DatasetReport>("dataset");

	return (
		<ReportCard
			className={className}
			command={DATA_COMMAND}
			description="What comes in, what the cleaning step throws away, and what each split ends up holding."
			id={id}
			report={report}
			title="From raw files to splits"
		>
			{(data) => (
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Stage</TableHead>
								<TableHead className="text-right">Flows</TableHead>
								<TableHead className="text-right">Attacks</TableHead>
								<TableHead>Note</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							<TableRow>
								<TableCell className="font-medium">Raw capture files</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatInteger(data.total_flows)}
								</TableCell>
								<TableCell className="text-right tabular-nums">-</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									eight sessions, {data.cleaning.feature_columns_before_pruning}{" "}
									numeric columns
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Padding removed</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatInteger(data.labelled_flows)}
								</TableCell>
								<TableCell className="text-right tabular-nums">-</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{formatInteger(data.padding_rows)} rows empty in every column
								</TableCell>
							</TableRow>
							<TableRow>
								<TableCell className="font-medium">Cleaned</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatInteger(
										Object.values(data.splits).reduce(
											(sum, split) => sum + split.rows,
											0
										)
									)}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{formatInteger(
										Object.values(data.splits).reduce(
											(sum, split) => sum + split.attacks,
											0
										)
									)}
								</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{formatInteger(data.cleaning.infinite_values)} infinite values,{" "}
									{formatInteger(data.cleaning.negative_durations)} negative
									durations, {data.cleaning.constant_columns.length} dead columns
								</TableCell>
							</TableRow>
							{Object.entries(data.splits).map(([name, split]) => (
								<TableRow key={name}>
									<TableCell className="pl-6 font-medium capitalize">
										{name} split
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatInteger(split.rows)}
									</TableCell>
									<TableCell className="text-right tabular-nums">
										{formatInteger(split.attacks)}
									</TableCell>
									<TableCell className="text-muted-foreground text-xs">
										{((split.attacks / split.rows) * 100).toFixed(2)} percent
										attacks
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</ReportCard>
	);
}
