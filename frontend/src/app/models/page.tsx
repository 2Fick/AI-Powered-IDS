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
			{/* The comparison table is wide, the latency chart is not, so they
			    share a row rather than each taking a full one. */}
			<ModelComparison className="lg:col-span-2" id="comparison" />
			<LatencyChart id="latency" stream={stream} />
			<AttackCoverage className="lg:col-span-2" id="coverage" />
			<FeatureImportanceChart id="importance" />
		</div>
	);
}
