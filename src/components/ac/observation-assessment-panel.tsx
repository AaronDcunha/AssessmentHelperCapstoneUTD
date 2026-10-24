"use client";

import { useCallback } from "react";
import { Section } from "@/components/ui/section";
import { loadObservationAssessment } from "@/lib/ac-assessment";
import { useApiResource } from "./use-api-resource";
import { AssessmentView } from "./assessment-view";

export function ObservationAssessmentPanel({ observationId }: { observationId: string }) {
  const result = useApiResource(useCallback(() => loadObservationAssessment(observationId), [observationId]), null);
  if (result.loading || result.error || !result.data) return <Section title="Assessment">
    <p className="text-body text-muted" role="status">{result.loading ? "Loading assessment…" : result.error ? "The assessment is currently unavailable or you do not have access to it." : "No assessment is available to view."}</p>
  </Section>;
  return <AssessmentView {...result.data} />;
}
