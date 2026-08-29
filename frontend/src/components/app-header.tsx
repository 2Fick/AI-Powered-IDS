"use client";

import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { CustomSidebarTrigger } from "@/components/custom-sidebar-trigger";
import { navLinks } from "@/components/app-shared";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppHeader({ active }: { active: string }) {
	const current = navLinks.find((item) => item.section === active);

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
				<AppBreadcrumbs page={current} />
			</div>
			<div className="flex items-center gap-3">
				<span className="hidden text-muted-foreground text-xs sm:inline">
					Three detectors on the same traffic
				</span>
				<ThemeToggle />
			</div>
		</header>
	);
}
