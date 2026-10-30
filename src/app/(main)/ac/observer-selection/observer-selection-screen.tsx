"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAcCycle } from "@/components/ac/cycle-context";
import { CandidateReviewDialog, ReleaseConfirmationDialog, type ReleaseListSummary } from "@/components/ac/observer-selection-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import {
  acApi, ApiRequestError, userDisplayName,
  type Cycle, type ObservationCandidatesResponse, type ObserverSelectionSignup,
} from "@/lib/ac-api";
import { currentSemesterCycle, hasGeneratedList, matchState, proposedMeetingsLabel, signupCourseLabel, signupWindow } from "@/lib/observer-selection";
import { deadlineDisplay } from "@/lib/ac-configuration";

type SignupRow = {
  signup: ObserverSelectionSignup;
  candidates: ObservationCandidatesResponse | null;
  candidateError: string | null;
  revision: number | null;
};

type ActionState = "idle" | "generating" | "releasing" | "regenerating";

function MatchBadge({ generated, count }: { generated: boolean; count: number }) {
  const state = matchState(generated, count);
  const tones = { neutral: "bg-neutral-bg text-ink", warning: "bg-warning-bg text-warning", danger: "bg-danger-bg text-danger" };
  return <span className={`inline-flex rounded-ah-8 px-ah-8 py-ah-8 text-caption ${tones[state.tone]}`}>{state.label}</span>;
}

export default function ObserverSelectionScreen({ canGenerate, canRelease, canRegenerate }: {
  canGenerate: boolean; canRelease: boolean; canRegenerate: boolean;
}) {
  const { cycles, loading, error, refreshCycles } = useAcCycle();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 60000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);
  const selectedCycle = currentSemesterCycle(cycles, now);
  if (loading || now === null) return <p role="status" className="text-body text-muted">Loading the current semester…</p>;
  if (error) return <div className="space-y-ah-16"><p role="alert" className="text-danger">{error}</p><Button variant="secondary" onClick={refreshCycles}>Retry</Button></div>;
  if (!selectedCycle) return <p role="status" className="text-body text-muted">No evaluation cycle could be identified for the current semester. Check the semester dates and evaluation cycle in Semester Settings.</p>;
  return <div className="space-y-ah-24">
    <p className="text-label text-muted">{selectedCycle.semester?.name}</p>
    <CycleObserverSelection key={selectedCycle.id} selectedCycle={selectedCycle} canGenerate={canGenerate} canRelease={canRelease} canRegenerate={canRegenerate} />
  </div>;
}

// A cycle change remounts this state, including pending reads, dialogs and selections.
function CycleObserverSelection({ selectedCycle, canGenerate, canRelease, canRegenerate }: {
  selectedCycle: Cycle; canGenerate: boolean; canRelease: boolean; canRegenerate: boolean;
}) {
  const cycleId = selectedCycle?.id;
  const requestId = useRef(0);
  const [rows, setRows] = useState<SignupRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!cycleId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [action, setAction] = useState<ActionState>("idle");
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reviewObservationId, setReviewObservationId] = useState<string | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, []);
  const signupState = signupWindow(selectedCycle?.signupDeadline, now);

  const loadRows = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!cycleId) {
      setRows([]); setSelected(new Set()); setLoadError(null); setGenerationId(null); setLoading(false);
      return;
    }
    setLoading(true); setLoadError(null);
    try {
      const signups = await acApi.getObserverSelectionSignups(cycleId);
      const loaded = await Promise.all(signups.map(async (signup): Promise<SignupRow> => {
        const [candidateResult, observationResult] = await Promise.allSettled([
          acApi.getObservationCandidates(signup.observationId),
          acApi.getObservation(signup.observationId),
        ]);
        const candidates = candidateResult.status === "fulfilled" ? candidateResult.value : null;
        const candidateError = candidateResult.status === "rejected"
          && (!(candidateResult.reason instanceof ApiRequestError) || candidateResult.reason.status !== 404)
          ? "Candidate data is currently unavailable." : null;
        const revision = observationResult.status === "fulfilled" ? observationResult.value.observation.revision ?? null : null;
        return { signup, candidates, candidateError, revision };
      }));
      if (currentRequest !== requestId.current) return;
      setRows(loaded);
      const responseGenerationId = loaded.find((row) => row.candidates?.generationId)?.candidates?.generationId;
      if (responseGenerationId) setGenerationId(responseGenerationId);
      const selectable = new Set(loaded.filter((row) => !row.candidates?.releasedAt)
        .map((row) => row.signup.observationId));
      setSelected((current) => {
        const retained = new Set([...current].filter((id) => selectable.has(id)));
        return retained;
      });
    } catch (reason) {
      if (currentRequest !== requestId.current) return;
      setRows([]);
      setLoadError(reason instanceof Error ? reason.message : "Observer-selection data could not be loaded.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    const requests = requestId;
    const handle = window.setTimeout(() => { void loadRows(); }, 0);
    return () => { window.clearTimeout(handle); ++requests.current; };
  }, [loadRows]);

  const generated = !!generationId || rows.some((row) => hasGeneratedList(row.candidates));
  const query = search.trim().toLocaleLowerCase();
  const visibleRows = rows.filter(row => !query || [row.signup.observee.name, row.signup.observee.displayName, row.signup.observee.username]
    .some(name => name?.toLocaleLowerCase().includes(query)));
  const visibleSelectableRows = visibleRows.filter(row => !row.candidates?.releasedAt && (canGenerate || (canRelease && (row.candidates?.items.length ?? 0) > 0)));
  const hiddenSelectedCount = rows.filter(row => selected.has(row.signup.observationId) && !visibleRows.includes(row)).length;
  const selectedSignups = rows.filter((row) => selected.has(row.signup.observationId) && !row.candidates?.releasedAt);
  const selectedRows = rows.filter((row) => selected.has(row.signup.observationId) && row.candidates && !row.candidates.releasedAt && row.candidates.items.length > 0);
  const insufficientCount = rows.filter((row) => row.candidates && row.candidates.items.length > 0 && row.candidates.items.length < 5).length;
  const unmatchedCount = rows.filter((row) => hasGeneratedList(row.candidates) && row.candidates?.items.length === 0).length;
  const reviewRow = rows.find((row) => row.signup.observationId === reviewObservationId) ?? null;
  const releaseId = generationId ?? rows.find((row) => row.candidates?.generationId)?.candidates?.generationId ?? null;

  const releaseSelected: ReleaseListSummary[] = selectedRows.map((row) => ({
    observationId: row.signup.observationId,
    observee: userDisplayName(row.signup.observee),
    candidateCount: row.candidates?.items.length ?? 0,
  }));
  const releaseUnselected = rows.filter((row) => row.candidates && !row.candidates.releasedAt && !selected.has(row.signup.observationId))
    .map((row) => userDisplayName(row.signup.observee));

  async function generate() {
    if (!cycleId || !canGenerate || loading || signupState !== "closed" || selectedSignups.length === 0 || action !== "idle") return;
    setAction("generating"); setActionError(null); setNotice(null);
    try {
      const response = await acApi.generateRecommendations(cycleId, { scope: { observationIds: selectedSignups.map(row => row.signup.observationId) } });
      setGenerationId(response.generationId);
      const resultDetails = response.insufficientCount == null || response.unmatchedCount == null
        ? "" : ` ${response.insufficientCount} insufficient; ${response.unmatchedCount} unmatched.`;
      setNotice(`Observer recommendations generated.${resultDetails}`);
      await loadRows();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Observer lists could not be generated.");
    } finally { setAction("idle"); }
  }

  async function regenerateObservation() {
    if (!reviewRow || reviewRow.revision == null || action !== "idle") return;
    setAction("regenerating"); setActionError(null); setNotice(null);
    try {
      const response = await acApi.regenerateObservationRecommendations(reviewRow.signup.observationId, { expectedRevision: reviewRow.revision });
      setGenerationId(response.generationId);
      setNotice(`The list for ${userDisplayName(reviewRow.signup.observee)} was regenerated with ${response.candidateCount} ${response.candidateCount === 1 ? "candidate" : "candidates"}.`);
      await loadRows();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "This observer list could not be regenerated.");
    } finally { setAction("idle"); }
  }

  async function release() {
    if (!cycleId || !releaseId || selectedRows.length === 0 || loading || action !== "idle") return;
    setAction("releasing"); setActionError(null); setNotice(null);
    try {
      // Individually generated batches can have different generation identifiers.
      const batches = new Map<string, string[]>();
      for (const row of selectedRows) {
        const id = row.candidates?.generationId ?? releaseId;
        batches.set(id, [...(batches.get(id) ?? []), row.signup.observationId]);
      }
      const released = new Set<string>();
      for (const [id, observationIds] of batches) {
        const response = await acApi.releaseRecommendations(cycleId, { generationId: id, observationIds });
        response.releasedObservationIds.forEach(id => released.add(id));
      }
      setReleaseOpen(false);
      setNotice(`${released.size} ${released.size === 1 ? "list was" : "lists were"} released.`);
      await loadRows();
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "The selected lists could not be released.");
      await loadRows();
    } finally { setAction("idle"); }
  }

  const busy = action !== "idle";
  return <div className="space-y-ah-24">
    <section aria-labelledby="faculty-signups-heading" className="space-y-ah-16">
      <div className="flex flex-wrap items-center gap-ah-16">
        <h2 id="faculty-signups-heading" className="text-section text-ink">Faculty signups ({rows.length})</h2>
        <div className="flex flex-wrap gap-ah-16">
          <Button variant={generated ? "secondary" : "primary"} className="w-full sm:w-[260px]" disabled={!canGenerate || !cycleId || loading || busy || selectedSignups.length === 0 || signupState !== "closed"} onClick={generate}>
            {action === "generating" ? "Generating…" : `Generate ${selectedSignups.length || "Selected"} ${selectedSignups.length === 1 ? "List" : "Lists"}`}
          </Button>
          {generated && <Button className="w-full sm:w-[280px]" disabled={!canRelease || loading || busy || selectedRows.length === 0 || !releaseId}
            onClick={() => { setActionError(null); setReleaseOpen(true); }}>Release {selectedRows.length} {selectedRows.length === 1 ? "List" : "Lists"} &amp; Notify</Button>}
        </div>
      </div>
      <p className="text-label text-ink">{!selectedCycle ? "Select an evaluation cycle." : signupState === "open"
        ? `Signup open until ${deadlineDisplay(selectedCycle.signupDeadline, selectedCycle.semester?.timeZone)} (${selectedCycle.semester?.timeZone || "UTC"}). Select signups now; generate lists after signup closes.`
        : signupState === "closed" ? "Signup closed · Select signups to generate or regenerate their lists."
        : "Signup deadline unavailable. Generation is unavailable until the deadline can be confirmed."}</p>
      <p className="text-caption text-muted">{selectedSignups.length} selected for generation · {selectedRows.length} ready to release{generated ? ` · ${insufficientCount} insufficient lists · ${unmatchedCount} signups with no matches` : ""}</p>
      {!canGenerate && <p className="text-caption text-muted">You can review signups but do not have permission to generate recommendations.</p>}
      {generated && !releaseId && <p className="text-caption text-warning">Generate the lists again before releasing them.</p>}
      {notice && <p role="status" className="rounded-ah-8 bg-neutral-bg p-ah-12 text-body text-ink">{notice}</p>}
      {actionError && <p role="alert" className="rounded-ah-8 bg-danger-bg p-ah-12 text-body text-danger">{actionError}</p>}
      {loadError && <p role="alert" className="rounded-ah-8 bg-danger-bg p-ah-12 text-body text-danger">Observer-selection data is currently unavailable. {loadError}</p>}

      <Input type="search" label="Search by observee name" placeholder="Search observee name…"
        value={search} onChange={event => setSearch(event.target.value)} wrapperClassName="max-w-[480px]"
        hint="Find signups by the name of the professor being observed." />
      {query && <p role="status" className="text-caption text-muted">Showing {visibleRows.length} of {rows.length} signups.</p>}
      {hiddenSelectedCount > 0 && <p className="text-caption text-warning">{hiddenSelectedCount} selected {hiddenSelectedCount === 1 ? "signup is" : "signups are"} hidden by your search and will still be included in selected actions.</p>}

      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface">
        <table className="w-full min-w-[1096px] border-collapse">
          <thead><tr>
            <TableCell variant="header" className="w-11!">
              <input type="checkbox" className="size-5 accent-sidebar" aria-label="Select all visible available signups"
                disabled={loading || busy || visibleSelectableRows.length === 0}
                checked={visibleSelectableRows.length > 0 && visibleSelectableRows.every(row => selected.has(row.signup.observationId))}
                onChange={event => {
                  const checked = event.target.checked;
                  setSelected(current => {
                    const next = new Set(current);
                    for (const row of visibleSelectableRows) {
                      if (checked) next.add(row.signup.observationId); else next.delete(row.signup.observationId);
                    }
                    return next;
                  });
                }} />
            </TableCell>
            <TableCell variant="header" className="w-[250px]!">Observee / Course</TableCell>
            <TableCell variant="header" className="w-[226px]!">Proposed meetings</TableCell>
            <TableCell variant="header" className="w-[200px]!">Match result</TableCell>
            <TableCell variant="header" className="w-[160px]!">Release status</TableCell>
            <TableCell variant="header" className="w-[216px]!">Action</TableCell>
          </tr></thead>
          <tbody>
            {visibleRows.map((row) => {
              const count = row.candidates?.items.length ?? 0;
              const released = !!row.candidates?.releasedAt;
              const selectable = !released && !loading && !busy && (canGenerate || (canRelease && count > 0));
              return <tr key={row.signup.signupId} className="border-t border-border">
                <TableCell className="w-11!">
                  <input type="checkbox" className="size-5 accent-sidebar" checked={selected.has(row.signup.observationId)} disabled={!selectable}
                    aria-label={`Select ${userDisplayName(row.signup.observee)}'s signup`}
                    onChange={(event) => setSelected((current) => {
                      const next = new Set(current);
                      if (event.target.checked) next.add(row.signup.observationId); else next.delete(row.signup.observationId);
                      return next;
                    })} />
                </TableCell>
                <TableCell className="w-[250px]!"><div className="space-y-ah-4">
                  <p className="text-label text-ink">{userDisplayName(row.signup.observee)}</p>
                  {row.signup.observee.email && <p className="break-all text-caption text-muted">{row.signup.observee.email}</p>}
                  <p className="text-caption text-ink">{signupCourseLabel(row.signup)}</p>
                </div></TableCell>
                <TableCell className="w-[226px]!"><div className="space-y-ah-4">
                  <p className="text-label text-ink">{proposedMeetingsLabel(row.signup.proposedMeetings)}</p>
                  <p className="text-caption text-muted">{row.signup.proposedMeetings[0]?.timeZone || "Time zone unavailable"}</p>
                </div></TableCell>
                <TableCell className="w-[200px]!">{row.candidateError
                  ? <span className="text-caption text-danger">Unavailable</span>
                  : <MatchBadge generated={hasGeneratedList(row.candidates)} count={count} />}</TableCell>
                <TableCell className="w-[160px]!">{released ? "Released" : "Not released"}</TableCell>
                <TableCell className="w-[216px]!">{hasGeneratedList(row.candidates)
                  ? <TextAction onClick={() => { setActionError(null); setReviewObservationId(row.signup.observationId); }}>{count > 0 ? "Review observers" : "Review issue"}</TextAction>
                  : <span className="inline-flex min-h-9 min-w-[110px] items-center justify-center text-label text-muted">—</span>}</TableCell>
              </tr>;
            })}
            {!loading && !loadError && rows.length === 0 && <tr><td colSpan={6} className="p-ah-24 text-body text-muted">{cycleId ? "No faculty signups are available for this evaluation cycle." : "Select an evaluation cycle to load faculty signups."}</td></tr>}
            {!loading && !loadError && rows.length > 0 && visibleRows.length === 0 && <tr><td colSpan={6} className="p-ah-24 text-body text-muted">No signups match your search.</td></tr>}
            {loading && <tr><td colSpan={6} className="p-ah-24 text-body text-muted">Loading faculty signups…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>

    <CandidateReviewDialog open={!!reviewRow} signup={reviewRow?.signup ?? null} candidates={reviewRow?.candidates ?? null}
      loading={loading} error={reviewRow?.candidateError ?? (action === "regenerating" ? null : actionError)} canRegenerate={canRegenerate && reviewRow?.revision != null}
      regenerating={action === "regenerating"} onClose={() => setReviewObservationId(null)} onRegenerate={regenerateObservation} />
    <ReleaseConfirmationDialog open={releaseOpen} selected={releaseSelected} unselected={releaseUnselected}
      pending={action === "releasing"} error={releaseOpen ? actionError : null} onClose={() => { if (action !== "releasing") setReleaseOpen(false); }} onConfirm={release} />
  </div>;
}
