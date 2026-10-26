"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { postFacultyAction } from "./faculty-api";
import { FacultyCycleSelector } from "./faculty-cycle-selector";
import { FacultyIssueControl } from "./faculty-participation-controls";
import type { FacultyWorkflow } from "@/server/queries/faculty-workflow";

export function FacultyCandidates({ data, accepted = false }: { data: FacultyWorkflow | null; accepted?: boolean }) {
  const router = useRouter(), [selection, setSelection] = useState<string[]>([]), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const rows = data?.links?.recommendations.filter(candidate => candidate.observationId === data.observation?.id && (!accepted || candidate.status === "ACCEPTED")) ?? [];
  async function act(path: string, body: unknown) {
    setPending(true); setMessage("");
    try { const result = await postFacultyAction<{ message: string }>(path, body); setMessage(result.message); setSelection([]); router.refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The action failed."); }
    finally { setPending(false); }
  }
  const observationId = rows[0]?.observationId;
  return <div className="space-y-ah-24"><FacultyCycleSelector dashboard={data?.dashboard} /><section className="space-y-ah-16"><h2 className="text-section">{accepted ? "Accepted candidates" : "Select candidates to request"}</h2>
    <p className="text-muted">{accepted ? "Choose one observer to confirm their accepted meeting. Other invitations will be cancelled." : "Select all or a subset of your released candidates. Availability is checked again when invitations are sent."}</p>
    <div className="overflow-x-auto rounded-ah-8 border border-border"><table className="w-full"><caption className="sr-only">{accepted ? "Accepted observers" : "Recommended observers"}</caption><thead><tr>{["Observer", accepted ? "Status" : "Available proposed dates", accepted ? "Observer-selected date / time" : "Selection", ...(accepted ? ["Action"] : [])].map(label => <TableCell key={label} variant="header">{label}</TableCell>)}</tr></thead><tbody>
      {rows.map(candidate => <tr key={candidate.id}><TableCell>{candidate.name}</TableCell><TableCell>{accepted ? candidate.status : candidate.dates.join(", ")}</TableCell><TableCell>{accepted ? candidate.acceptedDate : <label><input type="checkbox" disabled={pending || candidate.status !== "ELIGIBLE" || !data?.dashboard.access.observations} checked={selection.includes(candidate.id)} onChange={event => setSelection(previous => event.target.checked ? [...previous, candidate.id] : previous.filter(id => id !== candidate.id))} /> Select {candidate.name}</label>}</TableCell>{accepted && <TableCell><Button disabled={pending} onClick={() => act("selected-observer", { candidateId: candidate.id })}>Confirm Observer</Button></TableCell>}</tr>)}
      {!rows.length && <tr><td colSpan={accepted ? 4 : 3} className="bg-surface p-ah-24 text-muted">{!data ? "Candidate data is temporarily unavailable." : data.dashboard.cycleReason ?? (accepted ? "No accepted candidates are available." : "No released observer recommendations are available.")}</td></tr>}
    </tbody></table></div>
    {!accepted && <Button disabled={pending || !selection.length || !observationId || !data?.links?.allowedActions.invite} onClick={() => act("invitations", { observationId, candidateIds: selection })}>{pending ? "Sending…" : "Send Requests"}</Button>}
  </section>{message && <p role="status" className="rounded-ah-8 bg-neutral-bg p-ah-16">{message}</p>}
    {data?.observation?.participation === "observee" && <FacultyIssueControl observationId={data.observation.id} kind="ALERT" />}
    <ButtonLink variant="secondary" href="/observations/details">Back</ButtonLink>
  </div>;
}
