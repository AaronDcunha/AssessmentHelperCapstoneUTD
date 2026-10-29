"use client";

import { AlertContext } from "@/components/ac/alert-context";
import { useCallback, useState, type ReactNode } from "react";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Section } from "@/components/ui/section";
import { ObservationAssessmentPanel } from "@/components/ac/observation-assessment-panel";
import { ObservationTrackingDetails } from "@/components/ac/observation-tracking-details";
import { Button, ButtonLink } from "@/components/ui/button";
import { acApi, type ObservationDetail, userDisplayName } from "@/lib/ac-api";

const EMPTY_DETAIL: ObservationDetail = { observation: { id: "" }, progress: [], proposedMeetings: [] };

export function ObservationDetails({ observationId, canReadAssessment, backHref = "/ac/observations", backLabel = "Back to Observation Progress", alertId, children }: { observationId: string; canReadAssessment: boolean; backHref?: string; backLabel?: string; alertId?: string; children?: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const result = useApiResource(useCallback(() => { void attempt; return acApi.getObservation(observationId); }, [observationId, attempt]), EMPTY_DETAIL);
  const observation = result.data.observation;
  return (
    <div className="space-y-ah-24">
    <ButtonLink href={backHref} variant="secondary">{backLabel}</ButtonLink>
    <Section title="Observation Details" description="Read-only observation information.">
      {result.loading ? <p className="text-body text-muted" role="status">Loading observation…</p> : result.error ? <div className="space-y-ah-16"><p role="alert" className="text-body text-muted">Observation details are currently unavailable.</p><Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>Retry observation</Button></div> : (
        <dl className="grid grid-cols-1 gap-ah-24 md:grid-cols-2">
          <div><dt className="text-label text-muted">Observee</dt><dd className="text-body text-ink">{userDisplayName(observation.observee)}</dd></div>
          <div><dt className="text-label text-muted">Observer</dt><dd className="text-body text-ink">{userDisplayName(observation.observer)}</dd></div>
          <div><dt className="text-label text-muted">Status</dt><dd className="text-body text-ink">{observation.status ?? "—"}</dd></div>
          <div><dt className="text-label text-muted">Assessment</dt><dd className="text-body text-ink">{observation.assessmentStatus ?? "—"}</dd></div>
        </dl>
      )}
    </Section>
    {!result.loading && !result.error && alertId && <AlertContext observationId={observationId} alertId={alertId} />}
    {!result.loading && !result.error && <ObservationTrackingDetails detail={result.data} />}
    {!result.loading && !result.error && (canReadAssessment ? <ObservationAssessmentPanel observationId={observationId} /> :
      <Section title="Assessment"><p className="text-body text-muted">You do not have permission to view assessments.</p></Section>)}
    {!result.loading && !result.error && children}
    </div>
  );
}
