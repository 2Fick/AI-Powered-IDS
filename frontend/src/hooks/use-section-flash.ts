"use client";

import { useEffect } from "react";

const FLASH_CLASS = "section-flash";
const FLASH_MS = 1400;

/**
 * Scrolls to a card and makes it glow for a moment.
 *
 * Each page holds several cards, so landing on one and being left to hunt for
 * the right box defeats the point of the menu entry. The glow says where to
 * look and then gets out of the way.
 */
export function flashSection(section: string): void {
	const element = document.getElementById(section);
	if (!element) {
		return;
	}
	element.scrollIntoView({ behavior: "smooth", block: "start" });
	element.classList.remove(FLASH_CLASS);
	// Reading the layout forces the removal to take effect, so the animation
	// restarts when the same card is picked twice in a row.
	void element.offsetWidth;
	element.classList.add(FLASH_CLASS);
	setTimeout(() => element.classList.remove(FLASH_CLASS), FLASH_MS);
}

/**
 * Handles arriving on a page with a card named in the address.
 *
 * The router moves between pages with pushState, which never fires a
 * hashchange event, so clicks inside the sidebar call `flashSection` directly.
 * This covers the other two routes into a card: opening a link from outside,
 * and landing here from a different page.
 */
export function useSectionFlash(pathname: string): void {
	useEffect(() => {
		const section = window.location.hash.slice(1);
		if (!section) {
			return;
		}
		// A fresh page needs a beat to lay its cards out before we scroll.
		const timer = setTimeout(() => flashSection(section), 150);
		return () => clearTimeout(timer);
	}, [pathname]);
}
