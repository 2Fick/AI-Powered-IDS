"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type FlowEvent,
	type IntelEvent,
	type ModelName,
	type ReadyEvent,
	type StatsEvent,
	type StreamEvent,
	websocketUrl,
} from "@/lib/ids-api";

const MAX_ALERTS_KEPT = 60;
const MAX_HISTORY_POINTS = 40;

export type ConnectionState = "connecting" | "open" | "closed";

export type AlertRow = {
	key: string;
	flow: FlowEvent["flow"];
	truth: FlowEvent["truth"];
	verdicts: FlowEvent["verdicts"];
	receivedAt: number;
};

/** One point of the live charts: alerts and latency per model over a second. */
export type HistoryPoint = {
	second: number;
	label: string;
	flows: number;
	alerts: Record<ModelName, number>;
	latency: Record<ModelName, number>;
};

export type StreamSnapshot = {
	connection: ConnectionState;
	ready: ReadyEvent | null;
	stats: StatsEvent | null;
	alerts: AlertRow[];
	history: HistoryPoint[];
	attackMix: Record<string, number>;
	intel: Record<string, IntelEvent>;
	flowsSeen: number;
	setRate: (flowsPerSecond: number) => void;
	setPaused: (paused: boolean) => void;
	reset: () => void;
};

type Bucket = {
	second: number;
	flows: number;
	alerts: Record<ModelName, number>;
	latencyTotal: Record<ModelName, number>;
	decisions: number;
};

function emptyCounts(): Record<ModelName, number> {
	return { random_forest: 0, isolation_forest: 0, autoencoder: 0 };
}

function newBucket(second: number): Bucket {
	return {
		second,
		flows: 0,
		alerts: emptyCounts(),
		latencyTotal: emptyCounts(),
		decisions: 0,
	};
}

function closeBucket(bucket: Bucket): HistoryPoint {
	const latency = emptyCounts();
	for (const name of Object.keys(latency) as ModelName[]) {
		latency[name] = bucket.flows
			? bucket.latencyTotal[name] / bucket.flows
			: 0;
	}
	return {
		second: bucket.second,
		label: new Date(bucket.second * 1000).toLocaleTimeString([], {
			minute: "2-digit",
			second: "2-digit",
		}),
		flows: bucket.flows,
		alerts: { ...bucket.alerts },
		latency,
	};
}

/**
 * Holds one WebSocket connection to the replay endpoint and turns the event
 * stream into the shapes the dashboard renders: a rolling alert feed, per
 * second history for the charts, and the running scoreboard the server sends.
 */
export function useIdsStream(): StreamSnapshot {
	const [connection, setConnection] = useState<ConnectionState>("connecting");
	const [ready, setReady] = useState<ReadyEvent | null>(null);
	const [stats, setStats] = useState<StatsEvent | null>(null);
	const [alerts, setAlerts] = useState<AlertRow[]>([]);
	const [history, setHistory] = useState<HistoryPoint[]>([]);
	const [attackMix, setAttackMix] = useState<Record<string, number>>({});
	const [intel, setIntel] = useState<Record<string, IntelEvent>>({});
	const [flowsSeen, setFlowsSeen] = useState(0);

	const socketRef = useRef<WebSocket | null>(null);
	const bucketRef = useRef<Bucket | null>(null);

	const send = useCallback((message: Record<string, unknown>) => {
		const socket = socketRef.current;
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
		}
	}, []);

	const handleFlow = useCallback((event: FlowEvent) => {
		setFlowsSeen((count) => count + 1);

		const second = Math.floor(Date.now() / 1000);
		let bucket = bucketRef.current;
		if (!bucket) {
			bucket = newBucket(second);
			bucketRef.current = bucket;
		}
		if (bucket.second !== second) {
			const finished = closeBucket(bucket);
			setHistory((points) =>
				[...points, finished].slice(-MAX_HISTORY_POINTS)
			);
			bucket = newBucket(second);
			bucketRef.current = bucket;
		}

		bucket.flows += 1;
		for (const [name, verdict] of Object.entries(event.verdicts) as [
			ModelName,
			FlowEvent["verdicts"][ModelName],
		][]) {
			if (verdict.alert) {
				bucket.alerts[name] += 1;
			}
			bucket.latencyTotal[name] += verdict.latency_ms;
		}

		if (event.truth.is_attack) {
			setAttackMix((mix) => ({
				...mix,
				[event.truth.attack_type]: (mix[event.truth.attack_type] ?? 0) + 1,
			}));
		}

		if (event.any_alert) {
			setAlerts((rows) =>
				[
					{
						key: `${event.flow.id}-${Date.now()}`,
						flow: event.flow,
						truth: event.truth,
						verdicts: event.verdicts,
						receivedAt: Date.now(),
					},
					...rows,
				].slice(0, MAX_ALERTS_KEPT)
			);
		}
	}, []);

	useEffect(() => {
		const socket = new WebSocket(websocketUrl("/ws/stream"));
		socketRef.current = socket;

		socket.onopen = () => setConnection("open");
		socket.onclose = () => setConnection("closed");
		socket.onerror = () => setConnection("closed");
		socket.onmessage = (message) => {
			const event = JSON.parse(message.data) as StreamEvent;
			if (event.type === "flow") {
				handleFlow(event);
			} else if (event.type === "stats") {
				setStats(event);
			} else if (event.type === "ready") {
				setReady(event);
			} else if (event.type === "intel") {
				setIntel((current) => ({ ...current, [event.ip]: event }));
			}
		};

		return () => {
			socketRef.current = null;
			socket.close();
		};
	}, [handleFlow]);

	const setRate = useCallback(
		(flowsPerSecond: number) => {
			send({ type: "config", flows_per_second: flowsPerSecond });
		},
		[send]
	);

	const setPaused = useCallback(
		(paused: boolean) => {
			send({ type: paused ? "pause" : "resume" });
		},
		[send]
	);

	const reset = useCallback(() => {
		send({ type: "reset" });
		setAlerts([]);
		setHistory([]);
		setAttackMix({});
		setFlowsSeen(0);
		bucketRef.current = null;
	}, [send]);

	return useMemo(
		() => ({
			connection,
			ready,
			stats,
			alerts,
			history,
			attackMix,
			intel,
			flowsSeen,
			setRate,
			setPaused,
			reset,
		}),
		[
			connection,
			ready,
			stats,
			alerts,
			history,
			attackMix,
			intel,
			flowsSeen,
			setRate,
			setPaused,
			reset,
		]
	);
}
