"use client";

import { cn } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReportState } from "@/hooks/use-report";

/**
 * A card backed by a generated report.
 *
 * Every experiment on these pages is produced by a command, and a fresh clone
 * has run none of them. Rather than an empty panel, a card with no report
 * behind it names the command that makes one.
 */
export function ReportCard<T>({
	title,
	description,
	report,
	command,
	className,
	id,
	children,
}: {
	title: string;
	description: string;
	report: ReportState<T>;
	command: string;
	className?: string;
	id?: string;
	children: (data: T) => React.ReactNode;
}) {
	return (
		<Card className={cn("flex flex-col shadow-none dark:ring-0", className)} id={id}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col">
				{report.loading ? <Skeleton className="h-56 w-full" /> : null}
				{report.error ? (
					<p className="text-muted-foreground text-sm">
						Not generated yet. Run{" "}
						<code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
							{command}
						</code>
						.
					</p>
				) : null}
				{report.data ? children(report.data) : null}
			</CardContent>
		</Card>
	);
}
