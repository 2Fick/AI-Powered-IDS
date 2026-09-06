"use client";

import { useEffect, useState } from "react";
import { fetchReport } from "@/lib/ids-api";

export type ReportState<T> = {
	data: T | null;
	error: string | null;
	loading: boolean;
};

/**
 * Loads one of the generated reports.
 *
 * A missing report is a normal state, not a failure: a fresh clone has run
 * none of the experiments yet, and every card that uses one says which command
 * produces it rather than showing an empty box.
 */
export function useReport<T>(name: string): ReportState<T> {
	const [state, setState] = useState<ReportState<T>>({
		data: null,
		error: null,
		loading: true,
	});

	useEffect(() => {
		let cancelled = false;
		fetchReport<T>(name)
			.then((data) => {
				if (!cancelled) {
					setState({ data, error: null, loading: false });
				}
			})
			.catch((cause: Error) => {
				if (!cancelled) {
					setState({ data: null, error: cause.message, loading: false });
				}
			});
		return () => {
			cancelled = true;
		};
	}, [name]);

	return state;
}
