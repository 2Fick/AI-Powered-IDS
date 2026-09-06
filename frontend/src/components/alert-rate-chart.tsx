"use client";

import { cn } from "@/lib/utils";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import { MODEL_COLORS } from "@/lib/ids-api";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

const chartConfig = {
	random_forest: { label: "Random Forest", color: MODEL_COLORS.random_forest },
	isolation_forest: {
		label: "Isolation Forest",
		color: MODEL_COLORS.isolation_forest,
	},
	autoencoder: { label: "Autoencoder", color: MODEL_COLORS.autoencoder },
} satisfies ChartConfig;

/** Alerts raised per second by each model, over the last forty seconds. */
export function AlertRateChart({
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
		random_forest: point.alerts.random_forest,
		isolation_forest: point.alerts.isolation_forest,
		autoencoder: point.alerts.autoencoder,
	}));

	return (
		<Card className={cn("shadow-none dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>Alerts per second</CardTitle>
				<CardDescription>
					How loud each model is on the same traffic. A flat line near zero
					means the model is silent, not that the traffic is clean.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChartContainer className="h-64 w-full" config={chartConfig}>
					<AreaChart accessibilityLayer data={data}>
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
							allowDecimals={false}
							axisLine={false}
							label={{
								value: "alerts",
								angle: -90,
								position: "insideLeft",
								style: { fill: "var(--muted-foreground)", fontSize: 11 },
							}}
							tickLine={false}
							tickMargin={8}
							width={52}
						/>
						<ChartTooltip content={<ChartTooltipContent />} />
						<ChartLegend content={<ChartLegendContent />} />
						<Area
							isAnimationActive={false}
							dataKey="random_forest"
							fill="var(--color-random_forest)"
							fillOpacity={0.15}
							stroke="var(--color-random_forest)"
							type="monotone"
						/>
						<Area
							isAnimationActive={false}
							dataKey="isolation_forest"
							fill="var(--color-isolation_forest)"
							fillOpacity={0.15}
							stroke="var(--color-isolation_forest)"
							type="monotone"
						/>
						<Area
							isAnimationActive={false}
							dataKey="autoencoder"
							fill="var(--color-autoencoder)"
							fillOpacity={0.15}
							stroke="var(--color-autoencoder)"
							type="monotone"
						/>
					</AreaChart>
				</ChartContainer>
			</CardContent>
		</Card>
	);
}
