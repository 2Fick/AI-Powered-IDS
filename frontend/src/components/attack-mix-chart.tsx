"use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { Pie, PieChart } from "recharts";
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
import { formatInteger } from "@/components/formater";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

const SLICE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
	"var(--muted-foreground)",
];

const MAX_SLICES = 5;

/** What kinds of attack the replay has produced so far. */
export function AttackMixChart({
	stream,
	className,
}: {
	stream: StreamSnapshot;
	className?: string;
}) {
	const { slices, total } = useMemo(() => {
		const entries = Object.entries(stream.attackMix).sort(
			(left, right) => right[1] - left[1]
		);
		const head = entries.slice(0, MAX_SLICES);
		const tailCount = entries
			.slice(MAX_SLICES)
			.reduce((sum, [, count]) => sum + count, 0);
		if (tailCount > 0) {
			head.push(["Other", tailCount]);
		}
		return {
			slices: head.map(([family, count], index) => ({
				family,
				count,
				fill: SLICE_COLORS[index % SLICE_COLORS.length],
			})),
			total: entries.reduce((sum, [, count]) => sum + count, 0),
		};
	}, [stream.attackMix]);

	// Attack family names carry spaces, which cannot become CSS variable names,
	// so each slice brings its own fill and the config only supplies labels.
	const chartConfig = useMemo(
		() =>
			({
				count: { label: "Flows" },
				...Object.fromEntries(
					slices.map((slice) => [slice.family, { label: slice.family }])
				),
			}) satisfies ChartConfig,
		[slices]
	);

	return (
		<Card className={cn("flex flex-col shadow-none dark:ring-0", className)}>
			<CardHeader>
				<CardTitle>Attack mix</CardTitle>
				<CardDescription>
					{total > 0
						? `${formatInteger(total)} labelled attacks replayed so far.`
						: "Attack families seen in the replay so far."}
				</CardDescription>
			</CardHeader>
			<CardContent className="my-auto">
				{slices.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No attack traffic replayed yet.
					</p>
				) : (
					<ChartContainer
						className="mx-auto aspect-square max-h-64 w-full"
						config={chartConfig}
					>
						<PieChart accessibilityLayer>
							<ChartTooltip content={<ChartTooltipContent hideLabel />} />
							<Pie
								cornerRadius={6}
								data={slices}
								dataKey="count"
								// The slice values change every time an attack goes past, and
								// restarting the entry animation on each update leaves the
								// chart blank.
								isAnimationActive={false}
								innerRadius={34}
								nameKey="family"
								outerRadius="88%"
								stroke="var(--card)"
								strokeWidth={3}
							/>
							<ChartLegend content={<ChartLegendContent nameKey="family" />} />
						</PieChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
