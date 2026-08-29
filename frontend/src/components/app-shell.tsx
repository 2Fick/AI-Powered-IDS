"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { StreamProvider } from "@/components/stream-provider";
import { useSectionFlash } from "@/hooks/use-section-flash";

function Frame({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();
	useSectionFlash(pathname);

	return (
		<div className="overflow-hidden">
			<SidebarProvider className="relative h-svh">
				<AppSidebar />
				<SidebarInset className="md:peer-data-[variant=inset]:ml-0">
					<AppHeader />
					<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}

export function AppShell({ children }: { children: React.ReactNode }) {
	return (
		<StreamProvider>
			<Frame>{children}</Frame>
		</StreamProvider>
	);
}
