"use client";

import { ClassBubbles } from "@/components/class-bubbles";
import { FeatureSkewChart, PipelineSummary, SessionMixChart } from "@/components/data-charts";
import { FeatureDistributionChart } from "@/components/evidence-charts";

/** What the dataset looks like, and what the pipeline does to it. */
export default function DataPage() {
	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<PipelineSummary className="lg:col-span-2" id="pipeline" />
			<ClassBubbles id="balance" />
			<FeatureDistributionChart id="features" />
			<FeatureSkewChart id="skew" />
			<SessionMixChart id="sessions" />
		</div>
	);
}
