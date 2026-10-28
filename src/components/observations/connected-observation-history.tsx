"use client";

import { useEffect, useState } from "react";
import { getMyObservationHistory, ObservationApiError } from "@/lib/observations-api";
import { parseObservationHistoryResponse } from "@/lib/observation-history-response";
import type { ObservationHistoryRecord } from "@/lib/observation-history";
import { ObservationHistory, type HistoryPreviewState } from "./observation-history";

export function ConnectedObservationHistory({
  stateOverride,
}: {
  stateOverride?: HistoryPreviewState | "empty";
}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    state: HistoryPreviewState;
    records: ObservationHistoryRecord[];
    errorMessage?: string;
  }>({ state: "loading", records: [] });

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await getMyObservationHistory({ signal: controller.signal });
        const records = parseObservationHistoryResponse(response);
        if (!controller.signal.aborted) setResult({ state: "ready", records });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            state:
              error instanceof ObservationApiError && error.status === 403 ? "denied" : "error",
            records: [],
            errorMessage: error instanceof ObservationApiError ? error.message : undefined,
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);

  return (
    <ObservationHistory
      records={stateOverride === "empty" ? [] : result.records}
      initialState={stateOverride && stateOverride !== "empty" ? stateOverride : result.state}
      errorMessage={result.errorMessage}
      onRetry={() => {
        setResult({ state: "loading", records: [] });
        setAttempt((value) => value + 1);
      }}
    />
  );
}
