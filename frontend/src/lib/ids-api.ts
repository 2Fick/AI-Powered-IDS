/**
 * Client for the detection API.
 *
 * The base URL is read from NEXT_PUBLIC_API_URL so the same build runs against
 * a local backend during development and against the container in Docker.
 */

export const API_BASE_URL =
	process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function websocketUrl(path: string): string {
	const base = API_BASE_URL.replace(/^http/, "ws");
	return `${base}${path}`;
}

export type ModelName = "random_forest" | "isolation_forest" | "autoencoder";

export type ModelInfo = {
	name: ModelName;
	label: string;
	kind: string;
	threshold: number;
	hyperparameters: Record<string, unknown>;
};

export type Confusion = {
	true_negative: number;
	false_positive: number;
	false_negative: number;
	true_positive: number;
};

export type BenchmarkModel = {
	label: string;
	kind: string;
	threshold: number;
	recall: number;
	false_positive_rate: number;
	precision: number;
	f1: number;
	accuracy: number;
	roc_auc: number;
	pr_auc: number;
	confusion: Confusion;
	batch_latency_ms_per_flow: number;
	single_flow_latency: {
		p50_ms: number;
		p95_ms: number;
		mean_ms: number;
		samples: number;
	};
	per_attack_recall: Record<
		string,
		{ support: number; detected: number; recall: number }
	>;
};

export type BenchmarkReport = {
	generated_at: string;
	test_rows: number;
	test_attacks: number;
	target_fpr: number;
	machine: { platform: string; processor: string; python: string };
	models: Record<ModelName, BenchmarkModel>;
};

export type ReplaySummary = {
	flows: number;
	attacks: number;
	attack_types: Record<string, number>;
	first_captured_at: string;
	last_captured_at: string;
	default_flows_per_second: number;
	max_flows_per_second: number;
};

export type FlowDescription = {
	id: number;
	flow_id: string;
	source_ip: string;
	source_port: number;
	destination_ip: string;
	destination_port: number;
	protocol: number;
	captured_at: string | null;
	duration_us: number;
	forward_packets: number;
	backward_packets: number;
};

export type Verdict = {
	label: string;
	kind: string;
	score: number;
	threshold: number;
	alert: boolean;
	latency_ms: number;
};

export type FlowEvent = {
	type: "flow";
	flow: FlowDescription;
	truth: { is_attack: boolean; attack_type: string };
	verdicts: Record<ModelName, Verdict>;
	any_alert: boolean;
};

export type ModelCounters = {
	alerts: number;
	true_positive: number;
	false_positive: number;
	true_negative: number;
	false_negative: number;
	recall: number | null;
	false_positive_rate: number | null;
	precision: number | null;
	mean_latency_ms: number | null;
};

export type StatsEvent = {
	type: "stats";
	processed: number;
	total_flows: number;
	elapsed_seconds: number;
	actual_flows_per_second: number;
	flows_per_second: number;
	paused: boolean;
	models: Record<ModelName, ModelCounters>;
};

export type ReadyEvent = {
	type: "ready";
	total_flows: number;
	flows_per_second: number;
	models: { name: ModelName; label: string; kind: string }[];
	intel_enabled: boolean;
};

export type IntelEvent = {
	type: "intel";
	ip: string;
	routable: boolean;
	malicious: boolean;
	cached: boolean;
	sources: Record<string, unknown>;
};

export type StatusEvent = {
	type: "status";
	paused: boolean;
	flows_per_second: number;
	position: number;
};

export type StreamEvent =
	| FlowEvent
	| StatsEvent
	| ReadyEvent
	| IntelEvent
	| StatusEvent
	| { type: "error"; message: string };

async function getJson<T>(path: string): Promise<T> {
	const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
	if (!response.ok) {
		throw new Error(`${path} returned ${response.status}`);
	}
	return (await response.json()) as T;
}

export function fetchBenchmark() {
	return getJson<BenchmarkReport>("/api/benchmark");
}

export type SweepReport = {
	setup: {
		train_rows: number;
		test_rows: number;
		features: number;
		target_fpr: number;
		note: string;
	};
	random_forest_trees: {
		n_estimators: number;
		recall: number;
		false_positive_rate: number;
		roc_auc: number;
		fit_seconds: number;
		latency_ms: number;
	}[];
	isolation_forest_samples: {
		max_samples: number;
		recall: number;
		false_positive_rate: number;
		roc_auc: number;
		fit_seconds: number;
	}[];
	autoencoder_learning_curve: {
		epoch: number;
		loss: number;
		recall: number;
		roc_auc: number;
	}[];
	autoencoder_latent_dim: {
		latent_dim: number;
		recall: number;
		roc_auc: number;
		fit_seconds: number;
	}[];
};

export type CurvePoint = { fpr: number; tpr: number };

export type CurvesReport = {
	rows: number;
	attacks: number;
	models: Record<
		ModelName,
		{
			label: string;
			kind: string;
			roc_auc: number;
			pr_auc: number;
			roc: CurvePoint[];
			precision_recall: { recall: number; precision: number }[];
			threshold_sweep: {
				chosen_threshold: number;
				points: {
					threshold: number;
					recall: number;
					false_positive_rate: number;
					chosen: boolean;
				}[];
			};
			score_histogram: {
				chosen_threshold: number;
				bins: { score: number; benign: number; attack: number }[];
			};
		}
	>;
	feature_distributions: {
		feature: string;
		importance: number;
		benign_median: number;
		attack_median: number;
		bins: { value: number; benign: number; attack: number }[];
	}[];
	feature_importances: { feature: string; importance: number }[];
};

export type NoveltyReport = {
	train_rows: number;
	test_rows: number;
	target_fpr: number;
	results: {
		family: string;
		held_out_flows?: number;
		skipped?: string;
		recall_on_unseen?: Record<ModelName, number>;
		false_positive_rate?: Record<ModelName, number>;
	}[];
};

export type ValidationReport = {
	duplicate_overlap: {
		unique_flows: number;
		total_flows: number;
		test_rows: number;
		test_rows_seen_in_train: number;
		share_of_test_seen_in_train: number;
		share_of_test_attacks_seen_in_train: number;
	};
	random_split: Record<ModelName, { recall: number; false_positive_rate: number }>;
	time_ordered_split: Record<
		ModelName,
		{ recall: number; false_positive_rate: number }
	>;
};

export function fetchReport<T>(name: string) {
	return getJson<T>(`/api/reports/${name}`);
}

export function fetchModels() {
	return getJson<ModelInfo[]>("/api/models");
}

export function fetchReplaySummary() {
	return getJson<ReplaySummary>("/api/replay/summary");
}

export const MODEL_ORDER: ModelName[] = [
	"random_forest",
	"isolation_forest",
	"autoencoder",
];

export const MODEL_COLORS: Record<ModelName, string> = {
	random_forest: "var(--chart-1)",
	isolation_forest: "var(--chart-3)",
	autoencoder: "var(--chart-5)",
};
