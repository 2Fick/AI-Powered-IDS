"use client";

import {
	FeatureDistributionChart,
	FeatureImportanceChart,
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
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<ValidationTable className="lg:col-span-2" id="validation" />
			<NoveltyTable className="lg:col-span-2" id="novelty" />
			<RocCurvesChart id="roc" />
			<ThresholdTradeoffChart id="threshold" />
			<ScoreSeparationChart id="separation" />
			<FeatureImportanceChart id="importance" />
			<FeatureDistributionChart className="lg:col-span-2" id="features" />
		</div>
	);
}
