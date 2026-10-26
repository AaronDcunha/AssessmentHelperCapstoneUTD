"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form-fields";
import { postFacultyAction } from "./faculty-api";
import type { FacultyWorkflow } from "@/server/queries/faculty-workflow";

export function FacultyIssueControl({ observationId, kind }: { observationId: string; kind: "ALERT" | "NOT_OCCURRED" }) {
  const router = useRouter(), [opened, setOpened] = useState(false), [reason, setReason] = useState(""), [details, setDetails] = useState(""), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  return <div className="space-y-ah-16"><Button variant="secondary" onClick={() => setOpened(!opened)}>{kind === "ALERT" ? "Alert Assessment Committee" : "Report Not Completed"}</Button>
    {opened && <form className="space-y-ah-16 rounded-ah-8 border border-border bg-surface p-ah-24" onSubmit={async event => {
      event.preventDefault(); if (pending) return; setPending(true); setMessage("");
      try { const result = await postFacultyAction<{ message: string }>("issues", { observationId, kind, reason, details }); setMessage(result.message); setOpened(false); router.refresh(); }
      catch (error) { setMessage(error instanceof Error ? error.message : "The report could not be saved."); }
      finally { setPending(false); }
    }}><Input label="Reason" required maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /><Textarea label="Details" maxLength={20000} value={details} onChange={event => setDetails(event.target.value)} /><Button type="submit" disabled={pending}>Submit Report</Button></form>}
    {message && <p role="status" className="text-muted">{message}</p>}
  </div>;
}

export function FacultyFeedbackControl({ data }: { data: FacultyWorkflow | null }) {
  const router = useRouter(), [opened, setOpened] = useState(false), [id, setId] = useState(""), [rating, setRating] = useState(""), [difficulties, setDifficulties] = useState(""), [suggestions, setSuggestions] = useState(""), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const items = data?.links?.feedback ?? [], available = data?.links?.allowedActions.feedback ? items.filter(item => item.allowed && !item.submitted) : [];
  const [file, setFile] = useState<File | null>(null), [uploaded, setUploaded] = useState<{ id: string; observationId: string } | null>(null);
  return <div className="space-y-ah-16"><Button variant="secondary" disabled={!available.length} onClick={() => setOpened(!opened)}>Complete Survey</Button>
    {opened && <form className="space-y-ah-16 rounded-ah-8 border border-border bg-surface p-ah-24" onSubmit={async event => {
      event.preventDefault(); if (pending) return; setPending(true); setMessage("");
      try {
        const observationId = id || available[0]?.observationId;
        let attachment = uploaded?.observationId === observationId ? uploaded.id : null;
        if (file && !attachment) {
          const form = new FormData(); form.set("observationId", observationId); form.set("file", file);
          const response = await fetch("/api/me/dashboard/feedback/attachments", { method: "POST", body: form, cache: "no-store" }), result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Upload failed.");
          attachment = result.attachmentId; setUploaded({ id: result.attachmentId, observationId });
        }
        const result = await postFacultyAction<{ message: string }>("feedback", { observationId, satisfaction: Number(rating), difficulties, suggestions, ...(attachment ? { attachmentIds: [attachment] } : {}) }); setMessage(result.message); setOpened(false); router.refresh();
      }
      catch (error) { setMessage(error instanceof Error ? error.message : "The survey could not be saved."); }
      finally { setPending(false); }
    }}><Select label="Observation" value={id || available[0]?.observationId || ""} onChange={event => setId(event.target.value)}>{available.map(item => <option key={item.observationId} value={item.observationId}>{item.label} · {item.role}</option>)}</Select>
      <Select label="How satisfied were you with the process?" required value={rating} onChange={event => setRating(event.target.value)}><option value="">Choose a rating</option>{["Very dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very satisfied"].map((label, index) => <option key={label} value={index + 1}>{index + 1} · {label}</option>)}</Select>
      <Textarea label="Difficulties" maxLength={20000} value={difficulties} onChange={event => setDifficulties(event.target.value)} /><Textarea label="Suggestions" maxLength={20000} value={suggestions} onChange={event => setSuggestions(event.target.value)} /><Input type="file" label="Supporting material (optional)" accept="application/pdf,image/png,image/jpeg" disabled={pending || !!uploaded} onChange={event => setFile(event.target.files?.[0] ?? null)} hint="PDF, PNG or JPEG up to 5 MiB. Stored privately." /><Button type="submit" disabled={pending}>Submit Feedback</Button></form>}
    {!available.length && <p className="text-caption text-muted">{items.some(item => item.submitted) ? "Your feedback is recorded." : "Feedback opens after the observation deadline and closes at the feedback deadline for cycle participants."}</p>}
    {message && <p role="status" className="text-muted">{message}</p>}
    {items.flatMap(item => item.attachments).map(attachment => <a className="block text-caption text-sidebar underline" key={attachment.id} href={`/api/me/dashboard/feedback/attachments/${attachment.id}`}>Download {attachment.name}</a>)}
  </div>;
}
