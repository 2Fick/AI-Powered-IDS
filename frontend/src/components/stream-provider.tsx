"use client";

import { createContext, useContext } from "react";
import { type StreamSnapshot, useIdsStream } from "@/hooks/use-ids-stream";

const StreamContext = createContext<StreamSnapshot | null>(null);

/**
 * Holds the one connection to the replay endpoint.
 *
 * This sits in the shell rather than in a page, so moving between Overview,
 * Live traffic and Models does not drop the socket and reset every counter.
 * The running scoreboard is only meaningful if it keeps counting.
 */
export function StreamProvider({ children }: { children: React.ReactNode }) {
	const stream = useIdsStream();
	return (
		<StreamContext.Provider value={stream}>{children}</StreamContext.Provider>
	);
}

export function useStream(): StreamSnapshot {
	const stream = useContext(StreamContext);
	if (!stream) {
		throw new Error("useStream must be used inside a StreamProvider");
	}
	return stream;
}
