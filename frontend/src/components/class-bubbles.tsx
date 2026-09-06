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

/**
 * Colour bands by how much of the dataset a class holds.
 *
 * Several circles share a colour on purpose: the colour says which order of
 * magnitude a class sits in, and the size says the rest. The legend spells the
 * bands out, since a shared colour is otherwise read as a shared meaning that
 * is not there.
 */
const BANDS = [
	{ key: "benign", label: "Benign traffic", fill: "var(--chart-1)" },
	{ key: "major", label: "Attack, above 2% of flows", fill: "var(--chart-4)" },
	{
		key: "minor",
		label: "Attack, 0.1% to 2%",
		fill: "var(--chart-3)",
	},
	{ key: "rare", label: "Attack, under 0.1%", fill: "var(--chart-5)" },
] as const;

function bandFor(family: string, share: number): (typeof BANDS)[number] {
	if (family === "BENIGN") {
		return BANDS[0];
	}
	if (share > 0.02) {
		return BANDS[1];
	}
	if (share > 0.001) {
		return BANDS[2];
	}
	return BANDS[3];
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
 * Lay the classes out as circles whose size is the number of flows.
 *
 * A bar chart of this data needs a logarithmic axis to show anything, and a
 * logarithmic axis quietly hides the very imbalance it is drawing: the bars for
 * Heartbleed and DoS Hulk end up looking comparable. Circles keep the ratio
 * visible, and the small ones stay findable because they are pushed out to the
 * edge rather than flattened to nothing.
 *
 * Positions come from a short relaxation pass rather than a physics library:
 * seed each circle on a spiral, push overlapping pairs apart, pull gently back
 * to the middle. Fifteen circles settle instantly and it adds no dependency.
 */
function layout(families: DatasetReport["families"]): Bubble[] {
	const total = families.reduce((sum, row) => sum + row.flows, 0);
	const largest = Math.max(...families.map((row) => row.flows));

	// Radius scaled by the fourth root of the count. Area proportional to the
	// count would make Heartbleed a third of a pixel wide.
	const bubbles: Bubble[] = families.map((row, index) => {
		const share = row.flows / total;
		const angle = index * 2.39996;
		const distance = 14 * Math.sqrt(index);
		return {
			family: row.family,
			flows: row.flows,
			share,
			radius: 8 + 54 * (row.flows / largest) ** 0.25,
			x: WIDTH / 2 + distance * Math.cos(angle),
			y: HEIGHT / 2 + distance * Math.sin(angle),
			fill: bandFor(row.family, share).fill,
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
					a.x -= (dx / distance) * push;
					a.y -= (dy / distance) * push;
					b.x += (dx / distance) * push;
					b.y += (dy / distance) * push;
				}
			}
		}
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
			description="Every class as a circle, sized by how many flows it holds. Colour is the order of magnitude, size is the rest. Hover a circle to name it."
			id={id}
			report={report}
			title="Class balance"
		>
			{() => (
				<div className="flex flex-col gap-3">
					<svg
						aria-label="Class balance, each circle is one traffic class"
						className="w-full"
						role="img"
						viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
					>
						<title>Flows per traffic class</title>
						{bubbles.map((bubble) => {
							const isHovered = hovered === bubble.family;
							const dim = hovered !== null && !isHovered;
							// A circle wide enough to hold its own name keeps it.
							// The rest reveal it on hover, which is also why the
							// whole group fades: the label needs somewhere quiet
							// to land.
							const labelAlways = bubble.radius > 26;
							return (
								<g
									key={bubble.family}
									onMouseEnter={() => setHovered(bubble.family)}
									onMouseLeave={() => setHovered(null)}
								>
									<circle
										className={cn(
											"cursor-pointer transition-all duration-200",
											dim ? "opacity-20" : "opacity-90"
										)}
										cx={bubble.x}
										cy={bubble.y}
										fill={bubble.fill}
										r={isHovered ? bubble.radius + 4 : bubble.radius}
										stroke="var(--card)"
										strokeWidth={2}
									/>
									{labelAlways ? (
										<text
											className="pointer-events-none fill-background font-medium transition-opacity duration-200"
											fontSize={9}
											opacity={dim ? 0.3 : 1}
											textAnchor="middle"
											x={bubble.x}
											y={bubble.y + 3}
										>
											{bubble.family.split(" ")[0]}
										</text>
									) : (
										<text
											className="pointer-events-none fill-foreground font-medium transition-opacity duration-200"
											fontSize={10}
											opacity={isHovered ? 1 : 0}
											textAnchor="middle"
											x={bubble.x}
											y={bubble.y - bubble.radius - 6}
										>
											{bubble.family}
										</text>
									)}
								</g>
							);
						})}
					</svg>

					<div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
						{BANDS.map((band) => (
							<span
								className="flex items-center gap-1.5 text-muted-foreground text-xs"
								key={band.key}
							>
								<span
									className="size-2.5 shrink-0 rounded-[2px]"
									style={{ backgroundColor: band.fill }}
								/>
								{band.label}
							</span>
						))}
					</div>

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
