const agentPort = process.env.HOME_AGENT_PORT ?? "8787";

/** The screen talks only to the local agent, on this machine. */
const nextConfig = {
	poweredByHeader: false,
	// Compression buffers the live video and the detection events.
	compress: false,
	async rewrites() {
		return [{ source: "/api/:path*", destination: `http://127.0.0.1:${agentPort}/api/:path*` }];
	},
};

export default nextConfig;
