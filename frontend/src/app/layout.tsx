import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { themeBootstrapScript } from "@/components/theme-toggle";
import "./globals.css";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "Network intrusion detection",
	description:
		"Live comparison of three detection models replaying the CICIDS2017 capture.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
			lang="en"
			suppressHydrationWarning
		>
			<head>
				{/* Runs before the first paint so the page never flashes the wrong
				    theme on the way in. */}
				<script
					dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
					// biome-ignore lint/security/noDangerouslySetInnerHtml: a theme
					// bootstrap has to run before React hydrates.
				/>
			</head>
			<body className="flex min-h-full flex-col">
				<TooltipProvider>{children}</TooltipProvider>
			</body>
		</html>
	);
}
