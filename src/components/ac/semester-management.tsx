"use client";
import { useCallback, useState, type FormEvent } from "react";
import { acApi, type Cycle, type Semester } from "@/lib/ac-api";
import { configurationError } from "@/lib/ac-configuration";
import { useAcCycle } from "./cycle-context";
import { useApiResource } from "./use-api-resource";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

const EMPTY: { semesters: Semester[]; cycles: Cycle[] } = { semesters: [], cycles: [] };

export function SemesterManagement() {
  const { refreshCycles, selectCycle } = useAcCycle();
  const [generation, setGeneration] = useState(0), [opened, setOpened] = useState(false), [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const result = useApiResource(useCallback(async () => { void generation; const [semesters, cycles] = await Promise.all([acApi.getSemesters(), acApi.getEvaluationCycles()]); return { semesters, cycles }; }, [generation]), EMPTY);
  const [target, setTarget] = useState<Semester | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return; const form = event.currentTarget, values = new FormData(form);
    setPending(true); setMessage("");
    try { await acApi.createSemester({ year: Number(values.get("year")), season: String(values.get("season")), startsOn: String(values.get("startsOn")), endsOn: String(values.get("endsOn")), timeZone: String(values.get("timeZone")) }); form.reset(); setOpened(false); setGeneration(v => v + 1); refreshCycles(); setMessage("Semester created. Create its evaluation cycle from Evaluation Cycles."); }
    catch (error) { setMessage(configurationError(error)); } finally { setPending(false); }
  }
  async function remove() {
    if (!target || pending || result.loading || result.error) return;
    setPending(true); setMessage("");
    try { const cycle = result.data.cycles.find(c => c.semester?.id === target.id); await acApi.deleteSemester(target.id, { expectedRevision: target.revision, expectedCycleRevision: cycle?.revision ?? null }); setTarget(null); selectCycle(""); refreshCycles(); setGeneration(v => v + 1); setMessage("Semester and its evaluation cycle deleted."); }
    catch (error) { setTarget(null); setGeneration(v => v + 1); setMessage(configurationError(error)); } finally { setPending(false); }
  }
  return <Section title="Manage semesters" contentClassName="space-y-ah-16">
    <Button variant="secondary" disabled={pending} onClick={() => setOpened(v => !v)}>New Semester</Button>
    {opened && <form onSubmit={create} className="space-y-ah-16"><fieldset disabled={pending} className="grid gap-ah-16 md:grid-cols-2"><Input name="year" label="Year" type="number" min="2000" max="2099" required /><Select name="season" label="Season"><option>Spring</option><option>Summer</option><option>Fall</option></Select><Input name="startsOn" label="Semester Start" type="date" required /><Input name="endsOn" label="Semester End" type="date" required /><Input name="timeZone" label="Time zone" defaultValue="America/Chicago" required /></fieldset><Button type="submit" disabled={pending}>Create Semester</Button></form>}
    {result.loading && <p role="status">Loading semesters?</p>}
    {result.error && <div><p role="alert" className="text-danger">Unable to load semesters.</p><Button variant="secondary" onClick={() => setGeneration(v => v + 1)}>Retry semesters</Button></div>}
    {!result.loading && !result.error && <ul className="space-y-ah-12">{result.data.semesters.map(semester => <li key={semester.id} className="flex flex-wrap items-center justify-between gap-ah-16"><span>{semester.name}</span><Button variant="secondary" disabled={pending} onClick={() => setTarget(semester)}>Delete {semester.name}</Button></li>)}</ul>}
    {target && <div role="alert" className="space-y-ah-12 rounded-ah-8 border border-border p-ah-16"><p>Delete {target.name}? This permanently deletes its evaluation cycle, course sections, teaching assignments, signups, observations, recommendation lists and invitation history, assessments, reports and feedback, including supporting files.</p><div className="flex flex-wrap gap-ah-16"><Button variant="danger" disabled={pending || result.loading || !!result.error} onClick={remove}>{pending ? "Deleting?" : "Permanently Delete Semester"}</Button><Button variant="secondary" disabled={pending} onClick={() => setTarget(null)}>Cancel</Button></div></div>}
    {message && <p role="status">{message}</p>}
  </Section>;
}
