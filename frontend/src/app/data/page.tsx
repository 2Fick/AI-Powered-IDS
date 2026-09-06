"use client";

import {
	ClassBalanceChart,
	FeatureSkewChart,
	PipelineSummary,
	SessionMixChart,
} from "@/components/data-charts";

/** What the dataset looks like, and what the pipeline does to it. */
export default function DataPage() {
	return (
		<div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
			<PipelineSummary className="lg:col-span-2" id="pipeline" />
			<ClassBalanceChart id="balance" />
			<SessionMixChart id="sessions" />
			<FeatureSkewChart className="lg:col-span-2" id="skew" />
		</div>
	);
}
