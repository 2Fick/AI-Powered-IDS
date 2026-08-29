"use client";

import { AlertRateChart } from "@/components/alert-rate-chart";
import { AttackCoverage } from "@/components/attack-coverage";
import { AttackMixChart } from "@/components/attack-mix-chart";
import { DetectionStats } from "@/components/detection-stats";
import { LatencyChart } from "@/components/latency-chart";
import { LiveAlerts } from "@/components/live-alerts";
import { LiveScoreboard } from "@/components/live-scoreboard";
import { ModelComparison } from "@/components/model-comparison";
import { StreamControls } from "@/components/stream-controls";
import { ThreatIntelPanel } from "@/components/threat-intel-panel";
import { useIdsStream } from "@/hooks/use-ids-stream";

export function Dashboard() {
	const stream = useIdsStream();

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<DetectionStats stream={stream} />
			<StreamControls stream={stream} />
			<AttackMixChart stream={stream} />
			<ThreatIntelPanel stream={stream} />
			<AlertRateChart stream={stream} />
			<LatencyChart stream={stream} />
			<LiveAlerts stream={stream} />
			<LiveScoreboard stream={stream} />
			<ModelComparison />
			<AttackCoverage />
		</div>
	);
}
