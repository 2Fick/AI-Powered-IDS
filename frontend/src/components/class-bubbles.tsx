"use client";

import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { ReportCard } from "@/components/report-card";
import { formatInteger } from "@/components/formater";
import { useReport } from "@/hooks/use-report";
import type { DatasetReport } from "@/components/data-charts";

const WIDTH = 520;
const HEIGHT = 300;
const PADDING = 12;

/** Colour a family by how many flows it has, benign apart. */
function colourFor(family: string, share: number): string {
	if (family === "BENIGN") {
		return "var(--chart-1)";
	}
	if (share > 0.02) {
		return "var(--chart-4)";
	}
	if (share > 0.001) {
		return "var(--chart-3)";
	}
	return "var(--chart-5)";
}

type Bubble = {
	family: string;
	flows: number;
	share: number;
	radius: number;
	x: number;
	y: number;
	fill: string;
};

/**
 * Lay the classes out as circles whose area is the number of flows.
 *
 * A bar chart of this data needs a logarithmic axis to show anything, and a
 * logarithmic axis quietly hides the very imbalance it is drawing: the bars
 * for Heartbleed and DoS Hulk end up looking comparable. Circles sized by area
 * keep the ratio visible, and the small ones stay findable because they are
 * pushed out to the edge rather than flattened to nothing.
 *
 * Positions come from a short relaxation pass rather than a physics library:
 * seed each circle on a spiral, then push overlapping pairs apart. A hundred
 * iterations over fifteen circles settles instantly and needs no dependency.
 */
function layout(families: DatasetReport["families"]): Bubble[] {
	const total = families.reduce((sum, row) => sum + row.flows, 0);
	const largest = Math.max(...families.map((row) => row.flows));

	// Area proportional to the count would make Heartbleed a third of a pixel,
	// so radius is scaled by the fourth root: still monotonic, still honest
	// about the ordering, and every family stays visible.
	const bubbles: Bubble[] = families.map((row, index) => {
		const radius = 8 + 54 * (row.flows / largest) ** 0.25;
		const angle = index * 2.39996;
		const distance = 14 * Math.sqrt(index);
		return {
			family: row.family,
			flows: row.flows,
			share: row.flows / total,
			radius,
			x: WIDTH / 2 + distance * Math.cos(angle),
			y: HEIGHT / 2 + distance * Math.sin(angle),
			fill: colourFor(row.family, row.flows / total),
		};
	});

	for (let pass = 0; pass < 160; pass += 1) {
		for (let i = 0; i < bubbles.length; i += 1) {
			for (let j = i + 1; j < bubbles.length; j += 1) {
				const a = bubbles[i];
				const b = bubbles[j];
				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const distance = Math.hypot(dx, dy) || 0.01;
				const wanted = a.radius + b.radius + 3;
				if (distance < wanted) {
					const push = (wanted - distance) / 2;
					const ux = (dx / distance) * push;
					const uy = (dy / distance) * push;
					a.x -= ux;
					a.y -= uy;
					b.x += ux;
					b.y += uy;
				}
			}
		}
		// A gentle pull to the middle keeps the cluster from drifting apart.
		for (const bubble of bubbles) {
			bubble.x += (WIDTH / 2 - bubble.x) * 0.012;
			bubble.y += (HEIGHT / 2 - bubble.y) * 0.012;
			bubble.x = Math.min(
				WIDTH - bubble.radius - PADDING,
				Math.max(bubble.radius + PADDING, bubble.x)
			);
			bubble.y = Math.min(
				HEIGHT - bubble.radius - PADDING,
				Math.max(bubble.radius + PADDING, bubble.y)
			);
		}
	}
	return bubbles;
}

/** Every class as a circle, sized by how many flows it holds. */
export function ClassBubbles({
	className,
	id,
}: {
	className?: string;
	id?: string;
}) {
	const report = useReport<DatasetReport>("dataset");
	const [hovered, setHovered] = useState<string | null>(null);

	const bubbles = useMemo(
		() => (report.data ? layout(report.data.families) : []),
		[report.data]
	);
	const active = bubbles.find((bubble) => bubble.family === hovered);

	return (
		<ReportCard
			className={className}
			command="python -m ids.data.explore --out reports"
			description="Every class as a circle, sized by how many flows it holds. Benign in blue, then the attack families coloured by how common they are, red for the largest down to purple for the rarest. Hover a circle for the count."
			id={id}
			report={report}
			title="Class balance"
		>
			{() => (
				<div className="flex flex-col gap-2">
					<svg
						aria-label="Class balance, each circle is one traffic class"
						className="w-full"
						role="img"
						viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					>
						<title>Flows per traffic class</title>
						{bubbles.map((bubble) => {
							const dim = hovered !== null && hovered !== bubble.family;
							return (
								<g
									key={bubble.family}
									onMouseEnter={() => setHovered(bubble.family)}
									onMouseLeave={() => setHovered(null)}
								>
									<circle
										className={cn(
											"cursor-pointer transition-all duration-200",
											dim ? "opacity-25" : "opacity-90"
										)}
										cx={bubble.x}
										cy={bubble.y}
										fill={bubble.fill}
										r={
											hovered === bubble.family
												? bubble.radius + 4
												: bubble.radius
										}
										stroke="var(--card)"
										strokeWidth={2}
									/>
									{bubble.radius > 26 ? (
										<text
											className="pointer-events-none fill-background font-medium"
											fontSize={9}
											textAnchor="middle"
											x={bubble.x}
											y={bubble.y + 3}
										>
											{bubble.family === "BENIGN"
												? "BENIGN"
												: bubble.family.split(" ")[0]}
										</text>
									) : null}
								</g>
							);
						})}
					</svg>
					<p className="min-h-8 text-muted-foreground text-xs">
						{active ? (
							<>
								<span className="font-medium text-foreground">
									{active.family}
								</span>{" "}
								{formatInteger(active.flows)} flows,{" "}
								{active.share < 0.0001
									? "under 0.01"
									: (active.share * 100).toFixed(2)}{" "}
								percent of the dataset
							</>
						) : (
							"The largest class holds two hundred thousand times the flows of the smallest, which is why accuracy means nothing here and the benchmark reports recall per family."
						)}
					</p>
				</div>
			)}
		</ReportCard>
	);
}
