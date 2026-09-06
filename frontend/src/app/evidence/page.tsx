"use client";

import {
	RocCurvesChart,
	ScoreSeparationChart,
	ThresholdTradeoffChart,
} from "@/components/evidence-charts";
import {
	NoveltyTable,
	ValidationTable,
} from "@/components/experiment-tables";

/** Why the numbers on the models page should be believed. */
export default function EvidencePage() {
	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
			<ValidationTable className="lg:col-span-3" id="validation" />
			<NoveltyTable className="lg:col-span-3" id="novelty" />
			<RocCurvesChart id="roc" />
			<ThresholdTradeoffChart id="threshold" />
			<ScoreSeparationChart id="separation" />
		</div>
	);
}
