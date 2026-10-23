"use client";

import { useCallback } from "react";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Section } from "@/components/ui/section";
import { acApi, type ObservationDetail, userDisplayName } from "@/lib/ac-api";

const EMPTY_DETAIL: ObservationDetail = { observation: { id: "" }, progress: [], proposedMeetings: [] };

export function ObservationDetails({ observationId }: { observationId: string }) {
  const result = useApiResource(useCallback(() => acApi.getObservation(observationId), [observationId]), EMPTY_DETAIL);
  const observation = result.data.observation;
  return (
    <Section title="Observation Details" description="Authorized read-only observation information.">
      {result.error ? <p className="text-body text-muted">Observation details are currently unavailable.</p> : (
        <dl className="grid grid-cols-1 gap-ah-24 md:grid-cols-2">
          <div><dt className="text-label text-muted">Observee</dt><dd className="text-body text-ink">{userDisplayName(observation.observee)}</dd></div>
          <div><dt className="text-label text-muted">Observer</dt><dd className="text-body text-ink">{userDisplayName(observation.observer)}</dd></div>
          <div><dt className="text-label text-muted">Status</dt><dd className="text-body text-ink">{observation.status ?? "—"}</dd></div>
          <div><dt className="text-label text-muted">Assessment</dt><dd className="text-body text-ink">{observation.assessmentStatus ?? "—"}</dd></div>
        </dl>
      )}
    </Section>
  );
}
