"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { findPage } from "@/components/app-shared";
import { ThemeToggle } from "@/components/theme-toggle";
import { StreamIndicator } from "@/components/stream-indicator";

export function AppHeader() {
	const page = findPage(usePathname());

	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 border-b bg-background px-4 md:px-6"
			)}
		>
			<div className="flex items-center gap-3">
				<CustomSidebarTrigger />
				<Separator
					className="mr-2 h-4 data-[orientation=vertical]:self-center"
					orientation="vertical"
				/>
				<div className="flex items-baseline gap-3">
					<span className="font-medium text-sm">{page.title}</span>
					<span className="hidden text-muted-foreground text-xs md:inline">
						{page.blurb}
					</span>
				</div>
			</div>
			<div className="flex items-center gap-3">
				<StreamIndicator />
				<ThemeToggle />
			</div>
		</header>
	);
}
