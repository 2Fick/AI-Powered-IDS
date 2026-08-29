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
		<Card className={cn("shadow-none dark:ring-0", className)} id={id}>
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
			<CardContent>
				<ChartContainer className="aspect-video w-full" config={chartConfig}>
					<LineChart accessibilityLayer data={data}>
						<CartesianGrid vertical={false} />
						<XAxis
							axisLine={false}
							dataKey="label"
							minTickGap={24}
							tickLine={false}
							tickMargin={8}
						/>
						<YAxis
							axisLine={false}
							tickLine={false}
							tickMargin={8}
							unit=" ms"
							width={52}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
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
