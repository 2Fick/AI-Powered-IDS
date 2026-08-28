import type { ReactNode } from "react";
import {
	ActivityIcon,
	BookOpenIcon,
	BrainIcon,
	GaugeIcon,
	CodeIcon,
	LayoutGridIcon,
	ShieldAlertIcon,
	WavesIcon,
} from "lucide-react";

export type SidebarNavItem = {
	title: string;
	path?: string;
	icon?: ReactNode;
	isActive?: boolean;
	subItems?: SidebarNavItem[];
};

export type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
};

export const navGroups: SidebarNavGroup[] = [
	{
		items: [
			{
				title: "Overview",
				path: "#/overview",
				icon: <LayoutGridIcon />,
				isActive: true,
			},
		],
	},
	{
		label: "Live",
		items: [
			{
				title: "Alerts",
				path: "#alerts",
				icon: <ShieldAlertIcon />,
			},
			{
				title: "Replay stream",
				path: "#replay",
				icon: <WavesIcon />,
			},
		],
	},
	{
		label: "Models",
		items: [
			{
				title: "Comparison",
				path: "#comparison",
				icon: <GaugeIcon />,
			},
			{
				title: "Detectors",
				icon: <BrainIcon />,
				subItems: [
					{ title: "Random Forest", path: "#random-forest" },
					{ title: "Isolation Forest", path: "#isolation-forest" },
					{ title: "Autoencoder", path: "#autoencoder" },
				],
			},
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{
		title: "API docs",
		path: "http://localhost:8000/docs",
		icon: <BookOpenIcon />,
	},
	{
		title: "Dataset",
		path: "https://www.unb.ca/cic/datasets/ids-2017.html",
		icon: <ActivityIcon />,
	},
	{
		title: "Source",
		path: "https://github.com/2Fick/ai-ids-project",
		icon: <CodeIcon />,
	},
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) =>
		group.items.flatMap((item) =>
			item.subItems?.length ? [item, ...item.subItems] : [item]
		)
	),
	...footerNavLinks,
];
