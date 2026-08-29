import type { ReactNode } from "react";
import {
	ActivityIcon,
	BookOpenIcon,
	CodeIcon,
	GaugeIcon,
	GlobeIcon,
	LayoutGridIcon,
	ListChecksIcon,
	ShieldAlertIcon,
	TableIcon,
	WavesIcon,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	/** Id of the dashboard section this entry scrolls to. */
	section?: string;
	/** External address, for the links in the sidebar footer. */
	href?: string;
	icon?: ReactNode;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

/**
 * The dashboard is a single page, so navigation scrolls to a section rather
 * than loading a route. Every id here has to match the id on a card in
 * dashboard.tsx, and SECTION_IDS below is what the active entry is tracked
 * against.
 */
export const navGroups: SidebarNavGroup[] = [
	{
		items: [{ title: "Overview", section: "overview", icon: <LayoutGridIcon /> }],
	},
	{
		label: "Live",
		items: [
			{ title: "Replay stream", section: "replay", icon: <WavesIcon /> },
			{ title: "Alerts", section: "alerts", icon: <ShieldAlertIcon /> },
			{ title: "Rates and latency", section: "rates", icon: <ActivityIcon /> },
			{ title: "Threat intelligence", section: "intel", icon: <GlobeIcon /> },
		],
	},
	{
		label: "Models",
		items: [
			{
				title: "Running scoreboard",
				section: "scoreboard",
				icon: <ListChecksIcon />,
			},
			{ title: "Comparison", section: "comparison", icon: <GaugeIcon /> },
			{ title: "Attack coverage", section: "coverage", icon: <TableIcon /> },
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{
		title: "API docs",
		href: "http://localhost:8000/docs",
		icon: <BookOpenIcon />,
	},
	{
		title: "Dataset",
		href: "https://www.unb.ca/cic/datasets/ids-2017.html",
		icon: <ActivityIcon />,
	},
	{
		title: "Source",
		href: "https://github.com/2Fick/AI-Powered-IDS",
		icon: <CodeIcon />,
	},
];

export const navLinks: SidebarNavItem[] = navGroups.flatMap((group) =>
	group.items.flatMap((item) =>
		item.subItems?.length ? [item, ...item.subItems] : [item]
	)
);

export const SECTION_IDS = navLinks
	.map((item) => item.section)
	.filter((section): section is string => Boolean(section));
