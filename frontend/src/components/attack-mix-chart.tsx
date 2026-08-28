"use client";

import { cn } from "@/lib/utils";
import { useMemo } from "react";
import { Cell, Pie, PieChart } from "recharts";
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
import { formatInteger } from "@/components/formater";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

const SLICE_COLORS = [
	"var(--chart-1)",
	"var(--chart-2)",
	"var(--chart-3)",
	"var(--chart-4)",
	"var(--chart-5)",
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
			slices: head.map(([name, count], index) => ({
				name,
				count,
				fill: SLICE_COLORS[index % SLICE_COLORS.length],
			})),
			total: entries.reduce((sum, [, count]) => sum + count, 0),
		};
	}, [stream.attackMix]);

	const chartConfig = useMemo(
		() =>
			Object.fromEntries(
				slices.map((slice) => [slice.name, { label: slice.name }])
			) satisfies ChartConfig,
		[slices]
	);

	return (
		<Card className={cn("shadow-none dark:ring-0", className)}>
			<CardHeader>
				<CardTitle>Attack mix</CardTitle>
				<CardDescription>
					{total > 0
						? `${formatInteger(total)} labelled attacks replayed so far.`
						: "Attack families seen in the replay so far."}
				</CardDescription>
			</CardHeader>
			<CardContent>
				{slices.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No attack traffic replayed yet.
					</p>
				) : (
					<ChartContainer className="aspect-square w-full" config={chartConfig}>
						<PieChart>
							<ChartTooltip content={<ChartTooltipContent hideLabel />} />
							<Pie
								data={slices}
								dataKey="count"
								innerRadius="45%"
								nameKey="name"
								outerRadius="80%"
								strokeWidth={2}
							>
								{slices.map((slice) => (
									<Cell fill={slice.fill} key={slice.name} />
								))}
							</Pie>
						</PieChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}
