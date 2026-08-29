"use client";

import { cn } from "@/lib/utils";
import { PauseIcon, PlayIcon, RotateCcwIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { StatusIndicator } from "@/components/indicator";
import { formatInteger } from "@/components/formater";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

const RATES = ["4", "12", "25", "50", "80"];

const CONNECTION_TEXT = {
	connecting: "connecting",
	open: "streaming",
	closed: "disconnected",
} as const;

export function StreamControls({
	stream,
	className,
}: {
	stream: StreamSnapshot;
	className?: string;
}) {
	const [paused, setPaused] = useState(false);
	const [rate, setRate] = useState("12");

	function togglePause() {
		const next = !paused;
		setPaused(next);
		stream.setPaused(next);
	}

	function changeRate(value: string) {
		setRate(value);
		stream.setRate(Number(value));
	}

	return (
		<Card className={cn("shadow-none lg:col-span-2 dark:ring-0", className)}>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					Replay control
					<StatusIndicator
						color={stream.connection === "open" ? "emerald" : "rose"}
						pulse={stream.connection === "open" && !paused}
					/>
				</CardTitle>
				<CardDescription>
					{CONNECTION_TEXT[stream.connection]}
					{stream.ready
						? `, ${formatInteger(stream.ready.total_flows)} held out flows in the capture`
						: ""}
					.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-wrap items-center gap-2">
				<Button onClick={togglePause} size="sm" variant="outline">
					{paused ? (
						<PlayIcon className="size-4" />
					) : (
						<PauseIcon className="size-4" />
					)}
					{paused ? "Resume" : "Pause"}
				</Button>
				<Button onClick={stream.reset} size="sm" variant="outline">
					<RotateCcwIcon className="size-4" />
					Restart
				</Button>
				<Select onValueChange={changeRate} value={rate}>
					<SelectTrigger
						aria-label="Replay speed"
						className="w-full min-w-36 sm:w-fit"
						size="sm"
					>
						<SelectValue placeholder="Speed" />
					</SelectTrigger>
					<SelectContent align="end">
						{RATES.map((value) => (
							<SelectItem key={value} value={value}>
								{value} flows per second
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</CardContent>
		</Card>
	);
}
