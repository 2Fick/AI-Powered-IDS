"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "ids-theme";

export type Theme = "light" | "dark";

/**
 * Applies a theme and remembers it.
 *
 * The same logic runs twice: once as an inline script in the document head so
 * the page never paints the wrong theme first, and once here so the button can
 * change it. Keeping both in one place stops them drifting apart.
 */
export function applyTheme(theme: Theme): void {
	document.documentElement.classList.toggle("dark", theme === "dark");
	try {
		window.localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// Private windows can refuse to store anything. The theme still applies
		// for this visit, it just will not be remembered.
	}
}

/** The script that runs before the first paint. Dark is the default. */
export const themeBootstrapScript = `
(function () {
  try {
    var stored = window.localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    if (stored !== "light") document.documentElement.classList.add("dark");
  } catch (error) {
    document.documentElement.classList.add("dark");
  }
})();
`;

export function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>("dark");

	useEffect(() => {
		setTheme(
			document.documentElement.classList.contains("dark") ? "dark" : "light"
		);
	}, []);

	function toggle() {
		const next: Theme = theme === "dark" ? "light" : "dark";
		setTheme(next);
		applyTheme(next);
	}

	return (
		<Button
			aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
			onClick={toggle}
			size="icon-sm"
			variant="outline"
		>
			{theme === "dark" ? (
				<SunIcon className="size-4" />
			) : (
				<MoonIcon className="size-4" />
			)}
		</Button>
	);
}
