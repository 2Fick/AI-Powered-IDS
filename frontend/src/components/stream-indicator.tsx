"use client";

import { StatusIndicator } from "@/components/indicator";
import { formatInteger } from "@/components/formater";
import { useStream } from "@/components/stream-provider";

const CONNECTION_TEXT = {
	connecting: "connecting",
	open: "streaming",
	closed: "disconnected",
} as const;

/** Connection state in the header, so it is visible from every page. */
export function StreamIndicator() {
	const stream = useStream();
	const processed = stream.stats?.processed ?? 0;

	return (
		<span className="flex items-center gap-2 text-muted-foreground text-xs">
			<StatusIndicator
				color={stream.connection === "open" ? "emerald" : "rose"}
				pulse={stream.connection === "open"}
			/>
			<span className="hidden sm:inline">
				{CONNECTION_TEXT[stream.connection]}
				{processed > 0 ? `, ${formatInteger(processed)} flows` : ""}
			</span>
		</span>
	);
}
