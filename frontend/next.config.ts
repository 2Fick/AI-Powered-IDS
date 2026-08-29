import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Emits a self contained server bundle so the runtime image does not need
	// the whole node_modules tree.
	output: "standalone",

	// The dev server otherwise writes AGENTS.md and CLAUDE.md into the project
	// root on every start, which is noise this repository does not need.
	agentRules: false,
};

export default nextConfig;
