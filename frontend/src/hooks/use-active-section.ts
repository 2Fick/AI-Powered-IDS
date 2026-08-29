"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SECTION_IDS } from "@/components/app-shared";

/** Roughly the header height, so a section counts as current once it reaches it. */
const HEADER_OFFSET = 72;

/**
 * Tracks which dashboard section is in view and scrolls to a chosen one.
 *
 * The dashboard is one long page rather than a set of routes, so the sidebar
 * moves the viewport instead of navigating. An observer wakes the calculation
 * up as sections cross the edge of the screen, but the choice itself is made
 * on position rather than on how much of a section is visible: the cards are
 * wildly different heights, and a tall one filling the screen still reports a
 * small visible fraction.
 */
export function useActiveSection(): {
	active: string;
	goTo: (section: string) => void;
} {
	const [active, setActive] = useState(SECTION_IDS[0] ?? "");
	// A click wins over the observer until the smooth scroll has settled.
	const pinnedUntil = useRef(0);

	useEffect(() => {
		// Sorted by where the cards actually sit, which is not the order the
		// sidebar lists them in: the grid places some cards between two entries
		// that the menu shows one after the other.
		const elements = SECTION_IDS.map((id) => document.getElementById(id))
			.filter((element): element is HTMLElement => element !== null)
			.sort((left, right) =>
				left.compareDocumentPosition(right) &
				Node.DOCUMENT_POSITION_FOLLOWING
					? -1
					: 1
			);
		if (elements.length === 0) {
			return;
		}

		function recompute() {
			if (Date.now() < pinnedUntil.current) {
				return;
			}
			// The last section whose top has passed the header is the one being
			// read. Before any has, the first one is.
			let current = elements[0].id;
			for (const element of elements) {
				if (element.getBoundingClientRect().top <= HEADER_OFFSET) {
					current = element.id;
				}
			}
			setActive(current);
		}

		const observer = new IntersectionObserver(recompute, {
			threshold: [0, 0.5, 1],
		});
		for (const element of elements) {
			observer.observe(element);
		}

		const scroller = elements[0].closest(".overflow-y-auto") ?? window;
		scroller.addEventListener("scroll", recompute, { passive: true });
		recompute();

		return () => {
			observer.disconnect();
			scroller.removeEventListener("scroll", recompute);
		};
	}, []);

	const goTo = useCallback((section: string) => {
		const element = document.getElementById(section);
		if (!element) {
			return;
		}
		pinnedUntil.current = Date.now() + 800;
		setActive(section);
		element.scrollIntoView({ behavior: "smooth", block: "start" });
	}, []);

	return { active, goTo };
}
