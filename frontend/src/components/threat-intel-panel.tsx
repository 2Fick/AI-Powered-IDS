"use client";

import { cn } from "@/lib/utils";
import { GlobeIcon } from "lucide-react";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { IntelEvent } from "@/lib/ids-api";
import type { StreamSnapshot } from "@/hooks/use-ids-stream";

type VirusTotalSource = {
	status?: string;
	malicious?: number;
	country?: string;
	owner?: string;
};

type AbuseSource = {
	status?: string;
	abuse_confidence_score?: number;
	total_reports?: number;
	isp?: string;
};

function summarise(report: IntelEvent): string {
	const virustotal = report.sources.virustotal as VirusTotalSource | undefined;
	const abuse = report.sources.abuseipdb as AbuseSource | undefined;
	const parts: string[] = [];

	if (virustotal?.status === "ok") {
		parts.push(`${virustotal.malicious ?? 0} vendors flag it`);
		if (virustotal.owner) {
			parts.push(virustotal.owner);
		}
	}
	if (abuse?.status === "ok") {
		parts.push(`abuse score ${abuse.abuse_confidence_score ?? 0}`);
		if (abuse.total_reports) {
			parts.push(`${abuse.total_reports} reports`);
		}
	}
	if (parts.length === 0) {
		const status = virustotal?.status ?? abuse?.status ?? "no answer";
		return status;
	}
	return parts.join(", ");
}

/**
 * External context for the addresses that raised alerts.
 *
 * Only routable addresses are sent to the two services. Most of the CICIDS2017
 * traffic runs on a private test bed, so in practice this is the small set of
 * public addresses the capture touches.
 */
export function ThreatIntelPanel({
	stream,
	className,
}: {
	stream: StreamSnapshot;
	className?: string;
}) {
	const reports = Object.values(stream.intel).filter((item) => item.routable);
	const enabled = stream.ready?.intel_enabled ?? false;

	return (
		<Card className={cn("shadow-none dark:ring-0", className)}>
			<CardHeader>
				<CardTitle>Threat intelligence</CardTitle>
				<CardDescription>
					{enabled
						? "Public addresses behind alerts, checked against VirusTotal and AbuseIPDB."
						: "Set VIRUSTOTAL_API_KEY or ABUSEIPDB_API_KEY to enable lookups. Both services have a free tier."}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-3">
				{reports.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No public address has raised an alert yet.
					</p>
				) : null}
				{reports.map((report) => (
					<div className="flex items-start gap-3" key={report.ip}>
						<GlobeIcon className="mt-0.5 size-4 text-muted-foreground" />
						<div className="flex flex-col gap-1">
							<div className="flex items-center gap-2">
								<span className="font-mono text-sm">{report.ip}</span>
								<Badge variant={report.malicious ? "destructive" : "outline"}>
									{report.malicious ? "flagged" : "clean"}
								</Badge>
							</div>
							<span className="text-muted-foreground text-xs">
								{summarise(report)}
							</span>
						</div>
					</div>
				))}
			</CardContent>
		</Card>
	);
}
