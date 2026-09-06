"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoIcon } from "@/components/logo";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { footerNavLinks, pages } from "@/components/app-shared";
import { DatasetCard } from "@/components/dataset-card";
import { flashSection } from "@/hooks/use-section-flash";

export function AppSidebar() {
	const pathname = usePathname();

	return (
		<Sidebar collapsible="icon" variant="inset">
			<SidebarHeader className="h-14 justify-center">
				<SidebarMenuButton asChild tooltip="AI-Powered IDS">
					<Link href="/">
						<LogoIcon />
						<span className="font-medium">AI-Powered IDS</span>
					</Link>
				</SidebarMenuButton>
			</SidebarHeader>
			<SidebarContent>
				{pages.map((page) => {
					const current = pathname === page.path;
					return (
						<SidebarGroup key={page.path}>
							<SidebarGroupLabel>{page.title}</SidebarGroupLabel>
							<SidebarMenu>
								<SidebarMenuItem>
									<SidebarMenuButton
										asChild
										isActive={current}
										tooltip={page.title}
									>
										<Link href={page.path}>
											{page.icon}
											<span>{page.title}</span>
										</Link>
									</SidebarMenuButton>
									{/* The cards on the page, so a reader can jump straight to
									    the one they want. Only the open page lists them, since
									    all three at once makes the sidebar longer than the
									    screen and buries the pages themselves. */}
									{current ? (
										<SidebarMenuSub>
											{page.sections.map((section) => (
												<SidebarMenuSubItem key={section.section}>
													<SidebarMenuSubButton asChild>
														<Link
															href={`${page.path}#${section.section}`}
															onClick={() => flashSection(section.section)}
														>
															<span>{section.title}</span>
														</Link>
													</SidebarMenuSubButton>
												</SidebarMenuSubItem>
											))}
										</SidebarMenuSub>
									) : null}
								</SidebarMenuItem>
							</SidebarMenu>
						</SidebarGroup>
					);
				})}
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
