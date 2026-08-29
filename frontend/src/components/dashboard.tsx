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

// The sticky header would otherwise sit on top of whatever the sidebar just
// scrolled to.
const ANCHOR = "scroll-mt-20";

export function Dashboard() {
	const stream = useIdsStream();

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<DetectionStats className={ANCHOR} id="overview" stream={stream} />
			<StreamControls className={ANCHOR} id="replay" stream={stream} />
			<AttackMixChart className={ANCHOR} stream={stream} />
			<ThreatIntelPanel className={ANCHOR} id="intel" stream={stream} />
			<AlertRateChart className={ANCHOR} id="rates" stream={stream} />
			<LatencyChart className={ANCHOR} stream={stream} />
			<LiveAlerts className={ANCHOR} id="alerts" stream={stream} />
			<LiveScoreboard className={ANCHOR} id="scoreboard" stream={stream} />
			<ModelComparison className={ANCHOR} id="comparison" />
			<AttackCoverage className={ANCHOR} id="coverage" />
		</div>
	);
}
