"use client";

import { LogoIcon } from "@/components/logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { NavGroup } from "@/components/nav-group";
import { footerNavLinks, navGroups } from "@/components/app-shared";
import { DatasetCard } from "@/components/dataset-card";

export function AppSidebar({
	active,
	onSelect,
}: {
	active: string;
	onSelect: (section: string) => void;
}) {
	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton
					onClick={() => onSelect("overview")}
					tooltip="Flow Sentry"
				>
					<LogoIcon />
					<span className="font-medium">Flow Sentry</span>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{navGroups.map((group, index) => (
					<NavGroup
						active={active}
						key={`sidebar-group-${index}`}
						onSelect={onSelect}
						{...group}
					/>
				))}
			</SidebarContent>
			<SidebarFooter>
				<DatasetCard />
				<SidebarMenu className="mt-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								size="sm"
								tooltip={item.title}
							>
								<a href={item.href} rel="noreferrer" target="_blank">
									{item.icon}
									<span>{item.title}</span>
								</a>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
