"use client";

import { LiveAlerts } from "@/components/live-alerts";
import { LiveScoreboard } from "@/components/live-scoreboard";
import { ThreatIntelPanel } from "@/components/threat-intel-panel";
import { useStream } from "@/components/stream-provider";

/** Who is being flagged, and what the outside world knows about them. */
export default function LivePage() {
	const stream = useStream();

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<LiveAlerts className="lg:col-span-3" id="alerts" stream={stream} />
			<ThreatIntelPanel id="intel" stream={stream} />
			<LiveScoreboard
				className="lg:col-span-4"
				id="scoreboard"
				stream={stream}
			/>
		</div>
	);
}
