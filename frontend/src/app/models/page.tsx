"use client";

import { AttackCoverage } from "@/components/attack-coverage";
import { FeatureImportanceChart } from "@/components/evidence-charts";
import { LatencyChart } from "@/components/latency-chart";
import { ModelComparison } from "@/components/model-comparison";
import { useStream } from "@/components/stream-provider";

/** Which detector wins, where, and at what cost. */
export default function ModelsPage() {
	const stream = useStream();

	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
			<ModelComparison className="lg:col-span-2" id="comparison" />
			<FeatureImportanceChart id="importance" />
			{/* The coverage table is tall, so the latency chart beside it gets a
			    full height card rather than being squeezed into a short row. */}
			<AttackCoverage className="lg:col-span-2" id="coverage" />
			<LatencyChart className="h-full" id="latency" stream={stream} />
		</div>
	);
}
