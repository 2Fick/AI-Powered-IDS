import type { ReactNode } from "react";
import {
	ActivityIcon,
	BookOpenIcon,
	CodeIcon,
	DatabaseIcon,
	FlaskConicalIcon,
	GaugeIcon,
	GlobeIcon,
	MicroscopeIcon,
	LayoutGridIcon,
	ListChecksIcon,
	RadioIcon,
	ShieldAlertIcon,
	SlidersHorizontalIcon,
	TableIcon,
	TimerIcon,
	WavesIcon,
} from "lucide-react";

/** A card on one of the pages, reachable from the sidebar. */
export type SectionLink = {
	title: string;
	/** Matches the id on the card, and the hash in the address. */
	section: string;
	icon?: ReactNode;
};

export type PageLink = {
	title: string;
	/** What the page is for, shown under the title in the header. */
	blurb: string;
	path: string;
	icon: ReactNode;
	sections: SectionLink[];
};

/**
 * The dashboard is split into three pages rather than one long scroll.
 *
 * Each page answers a different question, so a reader arriving on one is not
 * asked to hold the whole system in their head at once, and a screenshot of
 * any page tells a single story.
 */
export const pages: PageLink[] = [
	{
		title: "Overview",
		blurb: "What the sensor is doing right now",
		path: "/",
		icon: <LayoutGridIcon />,
		sections: [
			{ title: "Headline numbers", section: "headline", icon: <GaugeIcon /> },
			{
				title: "Replay control",
				section: "replay",
				icon: <SlidersHorizontalIcon />,
			},
			{ title: "Attack mix", section: "mix", icon: <WavesIcon /> },
			{ title: "Alerts per second", section: "rate", icon: <ActivityIcon /> },
		],
	},
	{
		title: "Live traffic",
		blurb: "Who is being flagged, and what is known about them",
		path: "/live",
		icon: <RadioIcon />,
		sections: [
			{ title: "Alert feed", section: "alerts", icon: <ShieldAlertIcon /> },
			{ title: "Threat intelligence", section: "intel", icon: <GlobeIcon /> },
			{
				title: "Running scoreboard",
				section: "scoreboard",
				icon: <ListChecksIcon />,
			},
		],
	},
	{
		title: "Data",
		blurb: "What the dataset looks like, and what the pipeline does to it",
		path: "/data",
		icon: <DatabaseIcon />,
		sections: [
			{ title: "Raw files to splits", section: "pipeline" },
			{ title: "Class balance", section: "balance" },
			{ title: "Feature distributions", section: "features" },
			{ title: "Feature skew", section: "skew" },
			{ title: "Capture sessions", section: "sessions" },
		],
	},
	{
		title: "Models",
		blurb: "Which detector wins, where, and at what cost",
		path: "/models",
		icon: <TableIcon />,
		sections: [
			{ title: "Comparison", section: "comparison", icon: <GaugeIcon /> },
			{ title: "What the models look at", section: "importance" },
			{ title: "Attack coverage", section: "coverage", icon: <TableIcon /> },
			{ title: "Inference latency", section: "latency", icon: <TimerIcon /> },
		],
	},
	{
		title: "Tuning",
		blurb: "How each model was sized, and on what evidence",
		path: "/tuning",
		icon: <FlaskConicalIcon />,
		sections: [
			{ title: "Forest size", section: "forest-size" },
			{ title: "Samples per tree", section: "isolation-samples" },
			{ title: "Training curve", section: "learning-curve" },
			{ title: "Bottleneck size", section: "latent-size" },
		],
	},
	{
		title: "Evidence",
		blurb: "Why the numbers on the models page should be believed",
		path: "/evidence",
		icon: <MicroscopeIcon />,
		sections: [
			{ title: "Split validation", section: "validation" },
			{ title: "Unseen attacks", section: "novelty" },
			{ title: "ROC curves", section: "roc" },
			{ title: "Threshold trade off", section: "threshold" },
			{ title: "Score separation", section: "separation" },
		],
	},
];

export const footerNavLinks = [
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

export function findPage(pathname: string): PageLink {
	return pages.find((page) => page.path === pathname) ?? pages[0];
}
