import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// Emits a self contained server bundle so the runtime image does not need
	// the whole node_modules tree.
	output: "standalone",
};

export default nextConfig;
