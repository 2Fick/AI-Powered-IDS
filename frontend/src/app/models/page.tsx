"use client";

import { AttackCoverage } from "@/components/attack-coverage";
import { LatencyChart } from "@/components/latency-chart";
import { ModelComparison } from "@/components/model-comparison";
import { useStream } from "@/components/stream-provider";

/** Which detector wins, where, and at what cost. */
export default function ModelsPage() {
	const stream = useStream();

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<ModelComparison className="lg:col-span-4" id="comparison" />
			<AttackCoverage className="lg:col-span-4" id="coverage" />
			<LatencyChart className="lg:col-span-4" id="latency" stream={stream} />
		</div>
	);
}
