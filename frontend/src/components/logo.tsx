import type React from "react";

/** A shield with a pulse line, standing for traffic under inspection. */
export const LogoIcon = (props: React.ComponentProps<"svg">) => (
	<svg
		fill="none"
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={1.8}
		viewBox="0 0 24 24"
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M12 2.5 4.5 5.5v6c0 4.6 3.1 8.7 7.5 10 4.4-1.3 7.5-5.4 7.5-10v-6L12 2.5Z" />
		<path d="M7.5 12h2.2l1.4-3 1.8 6 1.4-3h2.2" />
	</svg>
);
