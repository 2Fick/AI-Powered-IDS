"use client";

import { cn } from "@/lib/utils";
import { ShieldAlertIcon, ShieldCheckIcon } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { MODEL_ORDER, type ModelName } from "@/lib/ids-api";
import type { AlertRow, StreamSnapshot } from "@/hooks/use-ids-stream";

const PROTOCOL_NAMES: Record<number, string> = {
	0: "HOPOPT",
	6: "TCP",
	17: "UDP",
};

const SHORT_MODEL_NAMES: Record<ModelName, string> = {
	random_forest: "RF",
	isolation_forest: "IF",
	autoencoder: "AE",
};

function agreeingModels(alert: AlertRow): ModelName[] {
	return MODEL_ORDER.filter((name) => alert.verdicts[name]?.alert);
}

/**
 * The alert feed. One row per flow that at least one model flagged, newest
 * first, with the ground truth label next to it so a viewer can tell a real
 * catch from a false positive at a glance.
 */
export function LiveAlerts({
	stream,
	className,
	id,
}: {
	stream: StreamSnapshot;
	className?: string;
	id?: string;
}) {
	return (
		<Card className={cn("shadow-none dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>Live alerts</CardTitle>
				<CardDescription>
					Flows at least one model flagged, newest first. The verdict column
					shows which models agreed.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="max-h-96 overflow-y-auto">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Source</TableHead>
								<TableHead>Destination</TableHead>
								<TableHead>Verdict</TableHead>
								<TableHead>Ground truth</TableHead>
								<TableHead className="text-right">Intel</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{stream.alerts.length === 0 ? (
								<TableRow>
									<TableCell
										className="text-muted-foreground text-sm"
										colSpan={5}
									>
										Waiting for the first alert.
									</TableCell>
								</TableRow>
							) : null}
							{stream.alerts.map((alert) => {
								const agreed = agreeingModels(alert);
								const intel = stream.intel[alert.flow.source_ip];
								const protocol =
									PROTOCOL_NAMES[alert.flow.protocol] ??
									String(alert.flow.protocol);
								return (
									<TableRow key={alert.key}>
										<TableCell className="font-mono text-xs">
											{alert.flow.source_ip}:{alert.flow.source_port}
										</TableCell>
										<TableCell className="font-mono text-xs">
											{alert.flow.destination_ip}:
											{alert.flow.destination_port}
											<span className="ml-2 text-muted-foreground">
												{protocol}
											</span>
										</TableCell>
										<TableCell>
											<div className="flex gap-1">
												{agreed.map((name) => (
													<Badge
														className="font-mono"
														key={name}
														variant="secondary"
													>
														{SHORT_MODEL_NAMES[name]}
													</Badge>
												))}
											</div>
										</TableCell>
										<TableCell>
											{alert.truth.is_attack ? (
												<span className="flex items-center gap-1 text-xs">
													<ShieldAlertIcon className="size-3.5 text-rose-500" />
													{alert.truth.attack_type}
												</span>
											) : (
												<span className="flex items-center gap-1 text-muted-foreground text-xs">
													<ShieldCheckIcon className="size-3.5" />
													benign, false positive
												</span>
											)}
										</TableCell>
										<TableCell className="text-right text-xs">
											{intel ? (
												intel.routable ? (
													<Badge
														variant={intel.malicious ? "destructive" : "outline"}
													>
														{intel.malicious ? "flagged" : "clean"}
													</Badge>
												) : (
													<span className="text-muted-foreground">internal</span>
												)
											) : (
												<span className="text-muted-foreground">-</span>
											)}
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			</CardContent>
		</Card>
	);
}
