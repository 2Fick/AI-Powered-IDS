"use client";

import {
	SidebarGroup,
	SidebarGroupLabel,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { SidebarNavGroup } from "@/components/app-shared";

export function NavGroup({
	label,
	items,
	active,
	onSelect,
}: SidebarNavGroup & {
	active: string;
	onSelect: (section: string) => void;
}) {
	return (
		<SidebarGroup>
			{label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
			<SidebarMenu>
				{items.map((item) => (
					<SidebarMenuItem key={item.title}>
						<SidebarMenuButton
							asChild
							isActive={item.section === active}
							tooltip={item.title}
						>
							{/* A real href so the entry can be opened in a new tab and
							    reads as a link, with the click handled here so the
							    scroll is smooth and the highlight updates. */}
							<a
								href={`#${item.section}`}
								onClick={(event) => {
									event.preventDefault();
									if (item.section) {
										onSelect(item.section);
									}
								}}
							>
								{item.icon}
								<span>{item.title}</span>
							</a>
						</SidebarMenuButton>
					</SidebarMenuItem>
				))}
			</SidebarMenu>
		</SidebarGroup>
	);
}
