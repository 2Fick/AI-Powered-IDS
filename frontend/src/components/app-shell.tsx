"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { useActiveSection } from "@/hooks/use-active-section";

export function AppShell({ children }: { children: React.ReactNode }) {
	const { active, goTo } = useActiveSection();

	return (
		<div className="overflow-hidden">
			<SidebarProvider className="relative h-svh">
				<AppSidebar active={active} onSelect={goTo} />
				<SidebarInset className="md:peer-data-[variant=inset]:ml-0">
					<AppHeader active={active} />
					<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
