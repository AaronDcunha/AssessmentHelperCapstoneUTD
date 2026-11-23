"use client";
import { notifyNotificationChange } from "@/lib/notifications-api";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { acApi } from "@/lib/ac-api";
import { deadlineDisplay } from "@/lib/ac-configuration";
import { postFacultyAction } from "./faculty-api";
import type { FacultyWorkflow } from "@/server/queries/faculty-workflow";

export function FacultyIssueControl({ observationId, kind, disabled = false }: { observationId: string; kind: "ALERT" | "NOT_OCCURRED"; disabled?: boolean }) {
  const router = useRouter(), [opened, setOpened] = useState(false), [reason, setReason] = useState(""), [details, setDetails] = useState(""), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const alertRequest=useRef<{body:string;key:string}|null>(null);
  return <div className="space-y-ah-16"><Button variant="secondary" disabled={pending || disabled} onClick={() => setOpened(!opened)}>{kind === "ALERT" ? "Alert Assessment Committee" : "Report Not Completed"}</Button>
    {opened && !disabled && <form className="space-y-ah-16 rounded-ah-8 border border-border bg-surface p-ah-24" onSubmit={async event => {
      event.preventDefault(); if (pending || disabled) return; setPending(true); setMessage("");
      try {
        const serialized=JSON.stringify({observationId,reason,details});
        if(kind==="ALERT"&&alertRequest.current?.body!==serialized)alertRequest.current={body:serialized,key:crypto.randomUUID()};
        const result = kind === "ALERT" ? await acApi.createObservationAlert(observationId, { reasonCode: "OTHER", reason, details, creationKey:alertRequest.current!.key }).then(() => ({ message: "Your alert was saved. The Assessment Committee has an in-app notification and email delivery is queued." })) : await postFacultyAction<{ message: string }>("issues", { observationId, kind, reason, details });
        alertRequest.current=null; notifyNotificationChange(); setMessage(result.message); setReason(""); setDetails(""); setOpened(false); router.refresh();
      }
      catch (error) { setMessage(error instanceof Error ? error.message : "The report could not be saved."); }
      finally { setPending(false); }
    }}><Input label="Reason" required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /><Textarea label="Details" maxLength={20000} value={details} onChange={event => setDetails(event.target.value)} /><Button type="submit" disabled={pending}>Submit Report</Button></form>}
    {message && <p role="status" className="text-muted">{message}</p>}
  </div>;
}

export function FacultyFeedbackControl({ data, observationId }: { data: FacultyWorkflow | null; observationId?: string }) {
  const router = useRouter(), [opened, setOpened] = useState(false), [id, setId] = useState(""), [rating, setRating] = useState(""), [difficulties, setDifficulties] = useState(""), [suggestions, setSuggestions] = useState(""), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const items = (data?.links?.feedback ?? []).filter(item => !observationId || item.observationId === observationId);
  const canSubmit = data?.links?.allowedActions.feedback;
  const available = canSubmit ? items.filter(item => item.allowed && !item.submitted) : [];
  const selected = available.find(item => item.observationId === id) ?? available[0];
  const timeZone = data?.dashboard.cycle?.timeZone ?? "UTC";
  const [file, setFile] = useState<File | null>(null), [uploaded, setUploaded] = useState<{ id: string; observationId: string } | null>(null);
  return <div id="observation-survey" className="space-y-ah-16">
    {selected && <p className="text-label text-ink">Required survey due <time dateTime={selected.deadline}>{deadlineDisplay(selected.deadline, timeZone)} ({timeZone})</time>. Both participants must submit.</p>}
    <Button variant="secondary" disabled={!selected || pending} aria-expanded={opened && !!selected} onClick={() => setOpened(!opened)}>Complete Survey</Button>
    {opened && selected && <form className="space-y-ah-16 rounded-ah-8 border border-border bg-surface p-ah-24" onSubmit={async event => {
      event.preventDefault(); if (pending) return; setPending(true); setMessage("");
      try {
        const observationId = selected.observationId;
        let attachment = uploaded?.observationId === observationId ? uploaded.id : null;
        if (file && !attachment) {
          const form = new FormData(); form.set("observationId", observationId); form.set("file", file);
          const response = await fetch("/api/me/dashboard/feedback/attachments", { method: "POST", body: form, cache: "no-store" }), result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Upload failed.");
          attachment = result.attachmentId; setUploaded({ id: result.attachmentId, observationId });
        }
        const result = await postFacultyAction<{ message: string }>("feedback", { observationId, satisfaction: Number(rating), difficulties, suggestions, ...(attachment ? { attachmentIds: [attachment] } : {}) }); setMessage(result.message); setOpened(false); setRating(""); setDifficulties(""); setSuggestions(""); setFile(null); setUploaded(null); router.refresh();
      }
      catch (error) { setMessage(error instanceof Error ? error.message : "The survey could not be saved."); }
      finally { setPending(false); }
    }}><Select label="Observation" value={selected.observationId} disabled={pending} onChange={event => { setId(event.target.value); setFile(null); setUploaded(null); }}>{available.map(item => <option key={item.observationId} value={item.observationId}>{item.label} · {item.role}</option>)}</Select>
      <Select label="How satisfied were you with the process?" required value={rating} onChange={event => setRating(event.target.value)}><option value="">Choose a rating</option>{["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"].map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}</Select>
      <Textarea label="Difficulties" maxLength={20000} value={difficulties} onChange={event => setDifficulties(event.target.value)} /><Textarea label="Suggestions" maxLength={20000} value={suggestions} onChange={event => setSuggestions(event.target.value)} /><Input type="file" label="Supporting material (optional)" accept="application/pdf,image/png,image/jpeg" disabled={pending || !!uploaded} onChange={event => setFile(event.target.files?.[0] ?? null)} hint="PDF, PNG or JPEG up to 5 MiB. Stored privately." /><Button type="submit" disabled={pending}>Submit Feedback</Button></form>}
    {!selected && <p className="text-caption text-muted">{!canSubmit ? "Survey submission is unavailable."
      : items.some(item => item.ready && !item.allowed && !item.submitted) ? "The feedback deadline has passed."
        : items.length > 0 && items.every(item => item.submitted) ? "Your feedback is recorded."
          : "The required survey opens once both participants acknowledge the observation."}</p>}
    {message && <p role="status" className="text-muted">{message}</p>}
    {items.flatMap(item => item.attachments).map(attachment => <a className="block text-caption text-sidebar underline" key={attachment.id} href={`/api/me/dashboard/feedback/attachments/${attachment.id}`}>Download {attachment.name}</a>)}
  </div>;
}
