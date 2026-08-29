"use client";

import { AlertRateChart } from "@/components/alert-rate-chart";
import { AttackMixChart } from "@/components/attack-mix-chart";
import { DetectionStats } from "@/components/detection-stats";
import { StreamControls } from "@/components/stream-controls";
import { useStream } from "@/components/stream-provider";

/** What the sensor is doing right now. */
export default function OverviewPage() {
	const stream = useStream();

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
			<DetectionStats id="headline" stream={stream} />
			<StreamControls className="lg:col-span-2" id="replay" stream={stream} />
			<AttackMixChart className="lg:col-span-2" id="mix" stream={stream} />
			<AlertRateChart className="lg:col-span-4" id="rate" stream={stream} />
		</div>
	);
}
