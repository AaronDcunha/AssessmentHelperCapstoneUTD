"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, type Cycle, type Semester } from "@/lib/ac-api";
import { configurationError, cycleDeadlines, deadlineKeys, deadlinePayload, type Deadlines } from "@/lib/ac-configuration";
import { useApiResource } from "./use-api-resource";
import { useAcCycle } from "./cycle-context";

const EMPTY_DEADLINES: Deadlines = { signupDeadline: "", observationDeadline: "", feedbackDeadline: "" };
type Loaded = { semesters: Semester[]; cycle: Cycle | null };
const EMPTY: Loaded = { semesters: [], cycle: null };

export function CycleForm({ mode, cycleId }: { mode: "create" | "edit"; cycleId?: string }) {
  const [retry, setRetry] = useState(0);
  const loader = useCallback(async (): Promise<Loaded> => {
    void retry; // Explicit reload creates a new resource request.
    try {
      if (mode === "edit" && cycleId) { const cycle = await acApi.getEvaluationCycle(cycleId); cycleDeadlines(cycle); return { semesters: [], cycle }; }
      return { semesters: await acApi.getSemesters(), cycle: null };
    } catch (error) { throw new Error(configurationError(error)); }
  }, [mode, cycleId, retry]);
  const result = useApiResource(loader, EMPTY);
  if (result.loading) return <p role="status">Loading cycle configuration…</p>;
  if (result.error) return <Section title="Cycle configuration unavailable"><p role="alert" className="text-danger">{result.error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry</Button></Section>;
  return <LoadedCycleForm key={`${cycleId ?? "new"}-${retry}`} mode={mode} data={result.data} reload={() => setRetry(value => value + 1)} />;
}

function LoadedCycleForm({ mode, data, reload }: { mode: "create" | "edit"; data: Loaded; reload: () => void }) {
  const router = useRouter();
  const { refreshCycles, cycles } = useAcCycle();
  const [semesterId, setSemesterId] = useState(data.cycle?.semester?.id ?? "");
  const [form, setForm] = useState<Deadlines>(() => data.cycle ? cycleDeadlines(data.cycle) : EMPTY_DEADLINES);
  const [message, setMessage] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const semester = data.cycle?.semester ?? data.semesters.find(item => item.id === semesterId);
  const allowed = mode === "create" || data.cycle?.allowedActions?.includes("update");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || !allowed) return;
    setMessage(null); setConflict(false);
    try {
      if (!semester?.id || !semester.timeZone) throw new Error("Choose a semester with a configured time zone.");
      const deadlines = deadlinePayload(form, semester.timeZone, data.cycle ?? undefined);
      if (mode === "edit" && data.cycle && deadlineKeys.every(key => deadlines[key] === data.cycle![key])) throw new Error("Change at least one deadline before saving.");
      busy.current = true; setSaving(true);
      if (mode === "create") await acApi.createCycle({ semesterId: semester.id, ...deadlines });
      else if (data.cycle && typeof data.cycle.revision === "number") await acApi.updateCycle(data.cycle.id, { ...deadlines, expectedRevision: data.cycle.revision });
      else throw new Error("The saved cycle revision is missing. Reload before saving.");
      if (active.current) { refreshCycles(); router.push("/ac/cycles"); }
    } catch (error) { if (active.current) { setMessage(configurationError(error)); setConflict((error as { status?: number }).status === 409); } }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }

  return <form onSubmit={submit} aria-busy={saving}>
    <Section title={mode === "create" ? "Create Cycle" : "Edit Cycle"} description="Configure the semester and the three evaluation-cycle deadlines." contentClassName="space-y-ah-24">
      {!allowed && <p className="text-warning">You cannot edit this cycle.</p>}
      {mode === "create" && !data.semesters.length && <p role="status">No semesters are available. Ask an administrator to provide a semester before creating a cycle.</p>}
      <fieldset disabled={saving || !allowed} className="grid min-w-0 grid-cols-1 gap-ah-16 md:grid-cols-2">
        {mode === "create" ? <Select label="Semester" name="semesterId" value={semesterId} required onChange={event => setSemesterId(event.target.value)}>
          <option value="">Select semester</option>
          {data.semesters.map(item => <option key={item.id} value={item.id} disabled={cycles.some(cycle => cycle.semester?.id === item.id)}>{item.name}{cycles.some(cycle => cycle.semester?.id === item.id) ? " — cycle already exists" : ""}</option>)}
        </Select> : <Input label="Semester" value={semester?.name ?? "Unavailable"} readOnly />}
        {deadlineKeys.map(key => <Input key={key} label={`${key === "signupDeadline" ? "Signup" : key === "observationDeadline" ? "Observation" : "Feedback"} deadline`} name={key} type="datetime-local" step="1" required value={form[key]} onChange={event => setForm(current => ({ ...current, [key]: event.target.value }))} />)}
      </fieldset>
      <p className="text-caption text-muted">Deadline times use {semester?.timeZone ?? "the selected semester’s time zone"}. Exact times are saved as UTC instants. Feedback may fall after semester end.</p>
      {message && <p role="alert" className="text-danger">{message}</p>}
      {conflict && <Button variant="secondary" disabled={saving} onClick={() => { if (window.confirm("Discard edits and reload the latest cycle?")) reload(); }}>Reload latest cycle</Button>}
      <div className="flex flex-wrap gap-ah-16">
        <Button type="submit" className="w-[200px]" disabled={saving || !allowed || !semester?.id}>{saving ? "Saving…" : mode === "create" ? "Create Cycle" : "Save Changes"}</Button>
        <ButtonLink href="/ac/cycles" variant="secondary" className="w-[200px]" aria-disabled={saving} onClick={event => { if (saving) event.preventDefault(); }}>Cancel</ButtonLink>
      </div>
    </Section>
  </form>;
}
