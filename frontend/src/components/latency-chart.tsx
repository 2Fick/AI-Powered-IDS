"use client";

import { cn } from "@/lib/utils";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@/components/ui/chart";
import { MODEL_COLORS, MODEL_ORDER, type ModelName } from "@/lib/ids-api";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

const chartConfig = {
	random_forest: { label: "Random Forest", color: MODEL_COLORS.random_forest },
	isolation_forest: {
		label: "Isolation Forest",
		color: MODEL_COLORS.isolation_forest,
	},
	autoencoder: { label: "Autoencoder", color: MODEL_COLORS.autoencoder },
} satisfies ChartConfig;

/**
 * Time each model spends deciding on one flow, measured live rather than
 * quoted from the benchmark. The number matters because a sensor that cannot
 * keep up with the link is not a sensor.
 */
export function LatencyChart({
	stream,
	className,
	id,
}: {
	stream: StreamSnapshot;
	className?: string;
	id?: string;
}) {
	const data = stream.history.map((point) => ({
		label: point.label,
		random_forest: Number(point.latency.random_forest.toFixed(3)),
		isolation_forest: Number(point.latency.isolation_forest.toFixed(3)),
		autoencoder: Number(point.latency.autoencoder.toFixed(3)),
	}));

	const latest = stream.history.at(-1);

	return (
		<Card className={cn("flex flex-col shadow-none dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>Inference latency</CardTitle>
				<CardDescription>
					Milliseconds to score a single flow.
					{latest
						? ` Latest: ${MODEL_ORDER.map(
								(name: ModelName) =>
									`${chartConfig[name].label} ${latest.latency[name].toFixed(2)} ms`
							).join(", ")}.`
						: ""}
				</CardDescription>
			</CardHeader>
			{/* Grows to whatever height the card is given, with a floor so it
			    stays readable when the card is short. */}
			<CardContent className="flex-1">
				<ChartContainer
					className="h-full min-h-64 w-full"
					config={chartConfig}
				>
					<LineChart accessibilityLayer data={data}>
						<CartesianGrid vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="label"
							label={{
								value: "clock time",
								position: "insideBottom",
								offset: -4,
								style: { fill: "var(--muted-foreground)", fontSize: 11 },
							}}
							minTickGap={24}
							tickLine={false}
							tickMargin={8}
						/>
						<YAxis
							axisLine={false}
							label={{
								value: "ms per flow",
								angle: -90,
								position: "insideLeft",
								style: { fill: "var(--muted-foreground)", fontSize: 11 },
							}}
							tickLine={false}
							tickMargin={8}
							unit=" ms"
							width={84}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<ChartLegend content={<ChartLegendContent />} />
						{MODEL_ORDER.map((name: ModelName) => (
							<Line
								dataKey={name}
								dot={false}
								// The series changes every second and restarting the entry
								// animation each time leaves the chart blank.
								isAnimationActive={false}
								key={name}
								stroke={`var(--color-${name})`}
								strokeWidth={2}
								type="monotone"
							/>
						))}
					</LineChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
