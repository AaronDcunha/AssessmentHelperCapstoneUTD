"use client";

import { AlertContext } from "@/components/ac/alert-context";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Section } from "@/components/ui/section";
import { ObservationAssessmentPanel } from "@/components/ac/observation-assessment-panel";
import { ObservationTrackingDetails } from "@/components/ac/observation-tracking-details";
import { Button, ButtonLink } from "@/components/ui/button";
import { acApi, type ObservationDetail, userDisplayName } from "@/lib/ac-api";

const EMPTY_DETAIL: ObservationDetail = { observation: { id: "" }, progress: [], proposedMeetings: [] };

export function ObservationDetails({ observationId, canReadAssessment, canDelete = false, canReassignTemplate = false, backHref = "/ac/observations", backLabel = "Back to Observation Progress", alertId, children }: { observationId: string; canReadAssessment: boolean; canDelete?: boolean; canReassignTemplate?: boolean; backHref?: string; backLabel?: string; alertId?: string; children?: ReactNode }) {
  const [attempt, setAttempt] = useState(0);
  const [templates, setTemplates] = useState<Array<{id:string;title:string;status:string}>>([]);
  const [templateId, setTemplateId] = useState("");
  const [mutationError, setMutationError] = useState<string|null>(null);
  const [busy, setBusy] = useState(false);
  const result = useApiResource(useCallback(() => { void attempt; return acApi.getObservation(observationId); }, [observationId, attempt]), EMPTY_DETAIL);
  const observation = result.data.observation;
  const protectedForHistory = result.data.protectedForHistory;
  useEffect(() => { if (canReassignTemplate && protectedForHistory === false) void acApi.getTemplates().then(rows => setTemplates(rows.filter(row => row.status === "published"))).catch(() => setTemplates([])); }, [canReassignTemplate, protectedForHistory]);
  async function deleteCurrent() {
    if (!canDelete || protectedForHistory !== false || observation.revision == null) return;
    const section = result.data.observation.section as {semester?:{name?:string};course?:{code?:string}}|undefined;
    if (!window.confirm(`Delete this unfinished observation for ${userDisplayName(observation.observee)} · ${section?.course?.code ?? "course unavailable"} · ${section?.semester?.name ?? "semester unavailable"}?\n\nInvitations, draft answers, feedback, attachments, and queued work will be removed. The signup remains and receives a fresh blank observation. Signed or completed evaluations cannot be deleted.`)) return;
    setBusy(true); setMutationError(null);
    try { await acApi.deleteObservation(observationId, observation.revision); window.location.assign(backHref); }
    catch (reason) { setMutationError(reason instanceof Error ? reason.message : "The observation could not be deleted."); setBusy(false); }
  }
  async function reassign() {
    if (!canReassignTemplate || protectedForHistory !== false || !templateId || observation.revision == null) return;
    if (!window.confirm("Reassign this unfinished observation to the selected published template? Compatible saved answers will be preserved. Removed questions or changed scales will require a second confirmation and will be archived.")) return;
    setBusy(true); setMutationError(null);
    try { await acApi.reassignObservationTemplate(observationId, {templateId,expectedRevision:observation.revision}); setAttempt(n=>n+1); }
    catch (reason) {
      if (reason instanceof Error && reason.message.includes("Confirm the reassignment")) {
        if (window.confirm(`${reason.message}\n\nContinue and archive the incompatible values?`)) {
          try { await acApi.reassignObservationTemplate(observationId, {templateId,expectedRevision:observation.revision,confirmImpact:true}); setAttempt(n=>n+1); }
          catch (retry) { setMutationError(retry instanceof Error ? retry.message : "The template could not be reassigned."); }
        }
      } else setMutationError(reason instanceof Error ? reason.message : "The template could not be reassigned.");
    } finally { setBusy(false); }
  }
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
    {!result.loading && !result.error && (canDelete || canReassignTemplate) && <Section title="Administrative actions" description="Only unfinished observations can be changed. Signed and completed history is protected.">
      <div className="space-y-ah-16">
        {protectedForHistory === true && <p className="text-body text-muted">This observation is protected for history. Deletion and template reassignment are unavailable.</p>}
        {protectedForHistory === false && canReassignTemplate && <div className="flex flex-wrap items-end gap-ah-12"><label className="grid gap-ah-4 text-label">Published template<select className="min-h-11 rounded-ah-8 border border-border bg-surface px-ah-12" value={templateId} onChange={event=>setTemplateId(event.target.value)}><option value="">Select a template</option>{templates.map(template=><option key={template.id} value={template.id}>{template.title}</option>)}</select></label><Button variant="secondary" disabled={busy||!templateId} onClick={()=>void reassign()}>Reassign unfinished form</Button></div>}
        {protectedForHistory === false && canDelete && <Button variant="danger" disabled={busy||observation.revision==null} onClick={()=>void deleteCurrent()}>{busy?"Working…":"Delete unfinished observation"}</Button>}
        {mutationError && <p role="alert" className="text-body text-danger">{mutationError}</p>}
      </div>
    </Section>}
    </div>
  );
}
