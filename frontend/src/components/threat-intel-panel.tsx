"use client";

import { cn } from "@/lib/utils";
import { GlobeIcon, RadarIcon, ServerIcon, ShieldIcon } from "lucide-react";
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
	owner?: string;
};

type AbuseSource = {
	status?: string;
	abuse_confidence_score?: number;
	total_reports?: number;
};

type ShodanSource = {
	status?: string;
	known?: boolean;
	port_count?: number;
	tags?: string[];
	vulnerability_count?: number;
};

type GreyNoiseSource = {
	status?: string;
	internet_scanner?: boolean;
	common_business_service?: boolean;
	classification?: string | null;
};

type Line = { icon: typeof GlobeIcon; text: string };

function lines(report: IntelEvent): Line[] {
	const virustotal = report.sources.virustotal as VirusTotalSource | undefined;
	const abuse = report.sources.abuseipdb as AbuseSource | undefined;
	const shodan = report.sources.shodan as ShodanSource | undefined;
	const greynoise = report.sources.greynoise as GreyNoiseSource | undefined;
	const result: Line[] = [];

	if (virustotal?.status === "ok") {
		result.push({
			icon: ShieldIcon,
			text: `${virustotal.malicious ?? 0} vendors flag it${
				virustotal.owner ? `, ${virustotal.owner}` : ""
			}`,
		});
	}
	if (abuse?.status === "ok") {
		result.push({
			icon: ShieldIcon,
			text: `abuse score ${abuse.abuse_confidence_score ?? 0} from ${
				abuse.total_reports ?? 0
			} reports`,
		});
	}
	if (shodan?.status === "ok" && shodan.known) {
		const tags = shodan.tags?.length ? `, ${shodan.tags.join(", ")}` : "";
		result.push({
			icon: ServerIcon,
			text: `${shodan.port_count ?? 0} ports open, ${
				shodan.vulnerability_count ?? 0
			} known CVEs${tags}`,
		});
	}
	if (greynoise?.status === "ok") {
		result.push({
			icon: RadarIcon,
			text: greynoise.internet_scanner
				? `scans the internet at large${
						greynoise.classification ? `, ${greynoise.classification}` : ""
					}`
				: greynoise.common_business_service
					? "a common business service, not an attacker"
					: "not a known internet wide scanner",
		});
	}
	if (result.length === 0) {
		result.push({ icon: GlobeIcon, text: "no source answered" });
	}
	return result;
}

/**
 * External context for the addresses that raised alerts.
 *
 * Only routable addresses are sent to the four services. Most of the
 * CICIDS2017 traffic runs on a private test bed, so in practice this is the
 * small set of public addresses the capture touches.
 */
export function ThreatIntelPanel({
	stream,
	className,
	id,
}: {
	stream: StreamSnapshot;
	className?: string;
	id?: string;
}) {
	const reports = Object.values(stream.intel).filter((item) => item.routable);

	return (
		<Card className={cn("shadow-none dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>Threat intelligence</CardTitle>
				<CardDescription>
					Public addresses behind alerts, checked against Shodan and GreyNoise,
					which need no key, plus VirusTotal and AbuseIPDB when a key is set.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex max-h-72 flex-col gap-3 overflow-y-auto">
				{reports.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						No public address has raised an alert yet.
					</p>
				) : null}
				{reports.map((report) => (
					<div className="flex flex-col gap-1" key={report.ip}>
						<div className="flex items-center gap-2">
							<span className="font-mono text-sm">{report.ip}</span>
							<Badge variant={report.malicious ? "destructive" : "outline"}>
								{report.malicious ? "flagged" : "clean"}
							</Badge>
						</div>
						{lines(report).map((line) => (
							<span
								className="flex items-start gap-2 text-muted-foreground text-xs"
								key={line.text}
							>
								<line.icon className="mt-0.5 size-3 shrink-0" />
								{line.text}
							</span>
						))}
					</div>
				))}
			</CardContent>
		</Card>
	);
}
