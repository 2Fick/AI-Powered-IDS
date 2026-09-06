"use client";

import {
	ForestSizeChart,
	IsolationSamplesChart,
	LatentSizeChart,
	LearningCurveChart,
} from "@/components/tuning-charts";

/** How each model was sized, and what the evidence for it was. */
export default function TuningPage() {
	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<ForestSizeChart id="forest-size" />
			<IsolationSamplesChart id="isolation-samples" />
			<LearningCurveChart id="learning-curve" />
			<LatentSizeChart id="latent-size" />
		</div>
	);
}
