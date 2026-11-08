"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { ApiRequestError } from "@/lib/ac-api";
import { meetingLabel } from "@/lib/observer-selection";
import { getLateRequests, lateAcceptanceJson, lateStatusLabel, type LateAcceptanceRequest, type LateAcceptanceResponse } from "@/lib/late-acceptance";
import { useApiResource } from "./use-api-resource";

const ROOT = "/ac/late-acceptance-requests";
function Badge({ request }: { request: LateAcceptanceRequest }) {
  return <span className={`inline-flex rounded-ah-pill px-ah-16 py-ah-4 text-caption ${request.actionable ? "bg-warning-bg text-warning" : "bg-neutral-bg text-ink"}`}>{lateStatusLabel(request)}</span>;
}
function date(value: string, zone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function Skeleton() {
  return <div role="status" aria-label="Loading late acceptance requests" className="space-y-ah-8">{Array.from({ length: 5 }, (_, i) => <div key={i} className="h-control-56 animate-pulse rounded-ah-8 bg-neutral-bg" />)}<span className="sr-only">Loading late acceptance requests…</span></div>;
}
export function LateAcceptanceScreen({ requestId }: { requestId?: string }) {
  const params = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "all");
  const [cursor, setCursor] = useState<string | null>(null);
  const [previous, setPrevious] = useState<(string | null)[]>([]);
  const [generation, setGeneration] = useState(0);
  const loader = useCallback(() => {
    void generation;
    const query = new URLSearchParams({ search, status });
    if (cursor) query.set("cursor", cursor);
    if (requestId) query.set("requestId", requestId);
    return getLateRequests(query);
  }, [search, status, cursor, generation, requestId]);
  const result = useApiResource<LateAcceptanceResponse | null>(loader, null);
  const retry = () => setGeneration(value => value + 1);
  const listQuery = new URLSearchParams({ search, status }).toString();
  const back = `${ROOT}?${listQuery}`;
  const resetPage = () => { setCursor(null); setPrevious([]); };
  const data = result.data;
  return <div className="space-y-ah-24">
    {data?.cycle && <p className="text-caption text-muted">Current semester · {data.cycle.name}</p>}
    {!requestId && <div className="grid max-w-[780px] gap-ah-16 sm:grid-cols-[1.7fr_1fr]">
      <Input label="Search by observer" placeholder="Search observer name…" maxLength={200} value={search} onChange={e => { setSearch(e.target.value); resetPage(); }} />
      <Select label="Request status" value={status} onChange={e => { setStatus(e.target.value); resetPage(); }}>
        <option value="all">All requests</option><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="notActionable">No longer actionable</option>
      </Select>
    </div>}
    {!requestId && <><h2 className="text-section">Review expired invitations</h2><p className="text-body text-muted">Observers can ask for another chance to accept after an invitation expires. Review each request before reopening its response window.</p></>}
    {result.loading ? <Skeleton /> : result.error ? <div role="alert" className="space-y-ah-16"><p className="text-danger">{result.error}</p><Button variant="secondary" onClick={retry}>Retry</Button><ButtonLink href={back} variant="secondary">Back to requests</ButtonLink></div> : !data?.cycle ? <p role="status">No current configured evaluation cycle could be identified. Check semester dates and evaluation cycles in Semester Settings.</p> : requestId ? <Review key={requestId} request={data.items[0]} back={back} reload={async () => { const saved = await getLateRequests(new URLSearchParams({ requestId })); return saved.items[0]; }} /> : <>
      <div className="rounded-ah-8 bg-neutral-bg p-ah-16 text-label" aria-live="polite">{data.summary.pending} pending requests · {data.summary.approved} approved · {data.summary.notActionable} no longer actionable <span className="block text-caption text-muted">Entire current cycle · counts unaffected by filters</span></div>
      {!data.items.length ? <p role="status">{data.summary.total === 0 ? "No late acceptance requests for this cycle" : "No requests match these filters."}</p> : <div className="overflow-x-auto rounded-ah-8 border border-border"><table className="w-full min-w-[800px] border-collapse"><caption className="sr-only">Late acceptance requests</caption><thead><tr>{["Observer requesting", "Observee", "Course / section", "Requested", "Status", "Action"].map(label => <TableCell key={label} variant="header">{label}</TableCell>)}</tr></thead><tbody>{data.items.map(request => <tr key={request.id} className="border-t border-border">
        <TableCell>{request.requester.name}</TableCell><TableCell>{request.observee.name}</TableCell><TableCell>{request.course} · {request.section}</TableCell><TableCell>{date(request.requestedAt, request.timeZone)}</TableCell><TableCell><Badge request={request} /></TableCell><TableCell><TextAction href={`${ROOT}/${encodeURIComponent(request.id)}?${listQuery}`} aria-label={`Review request from ${request.requester.name}`}>Review →</TextAction></TableCell>
      </tr>)}</tbody></table></div>}
      {(previous.length > 0 || data.pageInfo.hasMore) && <nav aria-label="Request pages" className="flex gap-ah-16"><Button variant="secondary" disabled={!previous.length} onClick={() => { setCursor(previous.at(-1) ?? null); setPrevious(p => p.slice(0, -1)); }}>Previous</Button><Button variant="secondary" disabled={!data.pageInfo.hasMore} onClick={() => { setPrevious(p => [...p, cursor]); setCursor(data.pageInfo.nextCursor); }}>Next</Button><Button variant="secondary" onClick={() => { resetPage(); retry(); }}>Refresh requests</Button></nav>}
      <p className="text-caption text-muted">All dates and times shown in {data.cycle.timeZone}. Approval reopens acceptance; the observee still confirms the final observer.</p>
    </>}
  </div>;
}

function Review({ request, back, reload }: { request: LateAcceptanceRequest; back: string; reload: () => Promise<LateAcceptanceRequest> }) {
  const [saved, setSaved] = useState<LateAcceptanceRequest | null>(null);
  const [decision, setDecision] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const current = saved ?? request;
  async function decide(value: "approved" | "rejected") {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await lateAcceptanceJson<{ request: { status: string } }>(`/api/expired-acceptance-requests/${encodeURIComponent(current.id)}`, { method: "PATCH", body: JSON.stringify({ decision: value }) });
      setDecision(result.request.status);
    } catch (failure) {
      if (failure instanceof ApiRequestError && [401, 403].includes(failure.status ?? 0)) setDenied(true);
      setError(failure instanceof Error ? failure.message : "Unable to save decision.");
      setUncertain(true);
      try { setSaved(await reload()); setUncertain(false); } catch { setError("Unable to verify the saved state. Retry before making another decision."); }
    } finally { submitting.current = false; setBusy(false); }
  }
  const outcome = decision ?? (["APPROVED", "REJECTED"].includes(current.status) ? current.status : null);
  const outcomeHeading = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (outcome || !current.actionable) outcomeHeading.current?.focus();
  }, [outcome, current.actionable]);
  if (outcome) return <Section aria-live="polite" contentClassName="space-y-ah-24" title={<span ref={outcomeHeading} tabIndex={-1}>{outcome === "APPROVED" ? "Acceptance window reopened" : "Late acceptance request rejected"}</span>}><Badge request={{ ...current, displayStatus: outcome, actionable: false }} /><p>{outcome === "APPROVED" ? "This approval reopened normal invitation acceptance. It did not assign an observer. The observer must accept a valid meeting, then the observee confirms the final observer." : "The expired invitation was not reopened by this decision. This rejection did not assign an observer."}</p><ButtonLink href={back}>Back to requests</ButtonLink></Section>;
  if (!current.actionable) return <Section aria-live="polite" contentClassName="space-y-ah-24" title={<span ref={outcomeHeading} tabIndex={-1}>This request can no longer be approved</span>}><Badge request={current} /><p>{current.requester.name}: {current.actionReason}</p><p className="text-caption text-muted">Approval requires the latest expired invitation, an unpaired open observation, and time remaining before the observation deadline.</p><ButtonLink href={back}>Refresh requests</ButtonLink></Section>;
  return <Section title="Review late acceptance request" contentClassName="space-y-ah-24">
    <p className="text-muted">{current.requester.name} → {current.observee.name} · {current.course}.{current.section}</p><Badge request={current} />
    <dl className="grid gap-ah-16 sm:grid-cols-2"><div><dt className="text-caption text-muted">Observer requesting</dt><dd>{current.requester.name}</dd></div><div><dt className="text-caption text-muted">Professor being observed</dt><dd>{current.observee.name}</dd></div></dl>
    <div className="space-y-ah-8 rounded-ah-8 bg-canvas p-ah-16"><h3 className="text-label">Reason for requesting late acceptance</h3><p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{current.reason || "No reason provided."}</p></div>
    <div className="space-y-ah-8 rounded-ah-8 bg-canvas p-ah-16"><h3 className="text-label">Invitation and observation context</h3><p>Invitation expired: {date(current.originalInvitationExpiresAt, current.timeZone)}<br />Request submitted: {date(current.requestedAt, current.timeZone)}<br />Observation deadline: {date(current.observationDeadline, current.timeZone)}<br />Time zone: {current.timeZone}</p><h4 className="text-label">Proposed meetings</h4>{current.proposedMeetings.length ? <ul>{current.proposedMeetings.map(m => <li key={m.id}>{meetingLabel(m)}{m.location ? ` · ${m.location}` : ""}</li>)}</ul> : <p>No proposed meetings.</p>}</div>
    <div className="space-y-ah-8 rounded-ah-8 bg-neutral-bg p-ah-16"><h3 className="text-label">What approval does</h3><p>Opens a new response window of up to 48 hours, ending no later than the observation deadline. {current.requester.name} must accept an available meeting; {current.observee.name} must then confirm the final observer.</p></div>
    {!current.actionable && <p role="status">{current.actionReason}</p>}
    {error && <p role="alert" className="text-danger">{error}</p>}
    <p className="text-caption text-muted">The request must still be pending and refer to the latest expired invitation. A superseded invitation or closed observation cannot be approved.</p>
    <div className="flex flex-wrap gap-ah-16" aria-busy={busy}>
      {current.actionable && !denied && !uncertain ? <><ButtonLink href={back} variant="secondary" onClick={e => { if (busy) e.preventDefault(); }} aria-disabled={busy}>Back to requests</ButtonLink><Button variant="secondary" disabled={busy} onClick={() => void decide("rejected")}>Reject request</Button><Button disabled={busy} onClick={() => void decide("approved")}>{busy ? "Saving decision…" : "Approve & reopen"}</Button></> : <><ButtonLink href={back}>Refresh requests</ButtonLink>{uncertain && <Button variant="secondary" disabled={busy} onClick={async () => { setBusy(true); try { setSaved(await reload()); setUncertain(false); setError(null); } catch { setError("Unable to verify the saved state. Please retry."); } finally { setBusy(false); } }}>Retry saved state</Button>}</>}
    </div>
  </Section>;
}
