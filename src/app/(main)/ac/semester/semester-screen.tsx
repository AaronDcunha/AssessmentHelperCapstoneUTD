"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, type Cycle, type Semester } from "@/lib/ac-api";
import { configurationError, cycleDeadlines, deadlinePayload, validDateOnly, type Deadlines } from "@/lib/ac-configuration";
import { guardUnsavedNavigation } from "@/lib/unsaved-navigation";
import { useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";

type Draft = Deadlines & { season: string; year: string; startsOn: string; endsOn: string; timeZone: string };
type Saved = { semester: Semester; cycle: Cycle | null };
const empty = (): Draft => ({ season: "Spring", year: "", startsOn: "", endsOn: "", timeZone: "America/Chicago", signupDeadline: "", observationDeadline: "", feedbackDeadline: "" });
const draftFor = ({ semester, cycle }: Saved): Draft => ({
  ...empty(), season: semester.season ?? "", year: String(semester.year ?? ""),
  startsOn: semester.startsOn ?? "", endsOn: semester.endsOn ?? "", timeZone: semester.timeZone,
  ...(cycle ? cycleDeadlines(cycle) : {}),
});
const EMPTY: Semester[] = [];
const discardMessage = "Discard unsaved semester changes?";

export default function SemesterSettingsPage({ canManage = false }: { canManage?: boolean }) {
  const { refreshCycles, selectCycle } = useAcCycle();
  const [generation, setGeneration] = useState(0);
  const semesters = useApiResource(useCallback(async () => {
    void generation;
    try { return await acApi.getSemesters(); } catch (error) { throw new Error(configurationError(error)); }
  }, [generation]), EMPTY);
  const [selection, setSelection] = useState("");
  const [creating, setCreating] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [draft, setDraft] = useState<Draft>(empty);
  const [baseline, setBaseline] = useState<Draft>(empty);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  const request = useRef(0);
  const active = useRef(true);
  const creationId = useRef("");
  const attempted = useRef<Parameters<typeof acApi.createSemester>[0] | null>(null);
  const editable = canManage && (!saved?.cycle || !!saved.cycle.allowedActions?.includes("updateSettings"));
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => {
    if (dirty || uncertain || pending) return guardUnsavedNavigation(window, document, discardMessage);
  }, [dirty, uncertain, pending]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const refresh = () => { setGeneration(v => v + 1); refreshCycles(); };
  const adopt = (value: Saved) => {
    setSaved(value); const next = draftFor(value); setDraft(next); setBaseline(next);
    setSelection(value.semester.id); setCreating(false); setUncertain(false); attempted.current = null;
    selectCycle(value.cycle?.id ?? "");
  };
  async function load(id: string) {
    const token = ++request.current;
    setSelection(id); setCreating(false); setSaved(null); setLoadError(""); setMessage(""); setConfirmDelete(false); setConflict(false);
    if (!id) { setDraft(empty()); setBaseline(empty()); return; }
    busy.current = true; setPending(true);
    try {
      const [all, cycles] = await Promise.all([acApi.getSemesters(), acApi.getEvaluationCycles({ semesterId: id })]);
      if (token !== request.current || !active.current) return;
      const semester = all.find(s => s.id === id);
      if (!semester) throw new Error("This semester no longer exists. Reload semesters.");
      const cycle = cycles[0] ? await acApi.getEvaluationCycle(cycles[0].id) : null;
      if (token !== request.current || !active.current) return;
      adopt({ semester: cycle?.semester as Semester ?? semester, cycle });
    } catch (error) { if (token === request.current && active.current) setLoadError(configurationError(error)); }
    finally { if (token === request.current && active.current) { busy.current = false; setPending(false); } }
  }
  function canLeave() { return !busy.current && !uncertain && (!dirty || window.confirm(discardMessage)); }
  function startNew() {
    if (!canLeave()) return;
    request.current++; creationId.current = crypto.randomUUID(); attempted.current = null;
    setCreating(true); setSelection(""); setSaved(null); setDraft(empty()); setBaseline(empty());
    setLoadError(""); setMessage(""); setConfirmDelete(false); setConflict(false);
  }
  function cancel() {
    if (busy.current || uncertain) return;
    if (creating) { setCreating(false); setDraft(empty()); setBaseline(empty()); }
    else { setDraft(baseline); }
    setMessage(""); setConflict(false); setConfirmDelete(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || !editable) return;
    setMessage(""); setSuccess(false); setConflict(false);
    try {
      if (!validDateOnly(draft.startsOn) || !validDateOnly(draft.endsOn) || draft.startsOn > draft.endsOn) throw new Error("Enter valid semester dates, with start on or before end.");
      // A zone change reinterprets the displayed wall times. Preserve exact saved
      // instants only when the zone itself has not changed.
      const deadlines = deadlinePayload(draft, draft.timeZone, saved?.semester.timeZone === draft.timeZone ? saved.cycle ?? undefined : undefined);
      const semester = { startsOn: draft.startsOn, endsOn: draft.endsOn, timeZone: draft.timeZone };
      busy.current = true; setPending(true);
      if (creating) {
        const payload = attempted.current ?? { id: creationId.current, year: Number(draft.year), season: draft.season, ...semester, deadlines };
        attempted.current = payload;
        const result = await acApi.createSemester(payload);
        if (!active.current) return;
        adopt({ semester: result, cycle: result.cycle ?? null });
      } else if (saved?.cycle) {
        if (typeof saved.cycle.revision !== "number") throw new Error("Reload settings before saving: cycle revision is missing.");
        const result = await acApi.updateCycleSettings(saved.cycle.id, { expectedCycleRevision: saved.cycle.revision, expectedSemesterRevision: saved.semester.revision, semester, deadlines });
        if (!active.current) return;
        adopt({ semester: result.semester as Semester, cycle: result.cycle });
      } else if (saved) {
        const result = await acApi.configureSemester(saved.semester.id, { expectedRevision: saved.semester.revision, ...semester, deadlines });
        if (!active.current) return;
        adopt(result);
      }
      setSuccess(true); setMessage(creating ? "Semester and evaluation cycle created." : "Settings saved."); refresh();
    } catch (error) {
      if (!active.current) return;
      const status = (error as { status?: number }).status;
      if (creating && attempted.current) {
        const unknown = !status || status >= 500;
        setUncertain(unknown);
        if (!unknown) attempted.current = null;
      }
      setMessage(configurationError(error)); setConflict(status === 409);
    } finally { busy.current = false; if (active.current) setPending(false); }
  }
  async function remove() {
    if (!saved || busy.current || !canManage) return;
    busy.current = true; setPending(true); setMessage(""); setSuccess(false);
    try {
      await acApi.deleteSemester(saved.semester.id, { expectedRevision: saved.semester.revision, expectedCycleRevision: saved.cycle?.revision ?? null });
      if (!active.current) return;
      setSaved(null); setSelection(""); setDraft(empty()); setBaseline(empty()); setConfirmDelete(false);
      selectCycle(""); refresh(); setSuccess(true); setMessage("Semester and dependent records deleted.");
    } catch (error) { if (!active.current) return; setMessage(configurationError(error)); setConflict((error as { status?: number }).status === 409); }
    finally { busy.current = false; if (active.current) setPending(false); }
  }
  function bind(key: keyof Draft) {
    return { name: key, value: draft[key], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setDraft(value => ({ ...value, [key]: event.target.value })); setMessage(""); setSuccess(false);
    } };
  }
  const ordered = [...semesters.data].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || ({ Fall: 3, Summer: 2, Spring: 1 }[b.season ?? ""] ?? 0) - ({ Fall: 3, Summer: 2, Spring: 1 }[a.season ?? ""] ?? 0) || b.name.localeCompare(a.name));
  return <div className="space-y-ah-24">
    <div className="flex flex-col gap-ah-16 sm:flex-row sm:items-end">
      <Select label="Semester" name="semesterId" wrapperClassName="w-full sm:max-w-[480px]" value={selection}
        disabled={pending || uncertain || semesters.loading || !!semesters.error}
        onChange={event => { if (canLeave()) void load(event.target.value); }}>
        <option value="">{semesters.loading ? "Loading semesters…" : "Select a semester"}</option>
        {ordered.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        {saved && !ordered.some(s => s.id === saved.semester.id) && <option value={saved.semester.id}>{saved.semester.name}</option>}
      </Select>
      {canManage && <Button variant="secondary" disabled={pending || uncertain} onClick={startNew}>New Semester</Button>}
    </div>
    {semesters.error && <div className="space-y-ah-8"><p role="alert" className="text-danger">{semesters.error}</p><Button variant="secondary" disabled={pending} onClick={() => setGeneration(v => v + 1)}>Retry semesters</Button></div>}
    {!semesters.loading && !semesters.error && !ordered.length && !creating && <p className="text-muted">No semesters are available. Create a semester to configure its evaluation cycle.</p>}
    {pending && !saved && !creating && <p role="status">Loading semester settings…</p>}
    {loadError && <div className="space-y-ah-8"><p role="alert" className="text-danger">{loadError}</p><Button variant="secondary" onClick={() => void load(selection)}>Retry settings</Button></div>}
    {(creating || saved) && <form onSubmit={submit} className="space-y-ah-24" aria-busy={pending}>
      <Section title={creating ? "New Semester" : saved!.semester.name} description="Semester boundaries are dates. Deadline times use the time zone entered below." contentClassName="space-y-ah-16">
        {saved && !saved.cycle && <p className="text-warning">This semester has no evaluation cycle. Save dates and deadlines below to create its cycle.</p>}
        {saved && (!saved.semester.startsOn || !saved.semester.endsOn) && <p className="text-warning">Semester boundaries have not been configured. Enter the actual academic dates.</p>}
        {!editable && <p className="text-warning">You cannot change these settings.</p>}
        <fieldset disabled={pending || uncertain || !editable} className="grid min-w-0 grid-cols-1 gap-ah-16 md:grid-cols-2">
          {creating && <><Select label="Season" required {...bind("season")}><option>Spring</option><option>Summer</option><option>Fall</option></Select><Input label="Year" type="number" min="2000" max="2099" required {...bind("year")} /></>}
          <Input label="Semester Start" type="date" required {...bind("startsOn")} />
          <Input label="Signup Deadline" type="datetime-local" step="1" required {...bind("signupDeadline")} />
          <Input label="Semester End" type="date" required {...bind("endsOn")} />
          <Input label="Observation Deadline" type="datetime-local" step="1" required {...bind("observationDeadline")} />
          <Input label="Time zone" required hint="IANA zone, for example America/Chicago. Changing it reinterprets the displayed deadline times." {...bind("timeZone")} />
          <Input label="Feedback Deadline" type="datetime-local" step="1" required {...bind("feedbackDeadline")} />
        </fieldset>
        <p className="text-caption text-muted">Signup must be before observation, then feedback. Feedback may follow semester end. Unchanged deadlines retain their exact saved times.</p>
      </Section>
      {uncertain && <p role="alert" className="text-warning">Creation could not be confirmed. Retry Create with the original values to recover the saved semester safely.</p>}
      <div className="flex flex-wrap gap-ah-16">
        <Button type="submit" disabled={pending || !editable}>{pending ? "Saving…" : creating ? uncertain ? "Retry Create" : "Create Semester" : saved?.cycle ? "Save Settings" : "Save and Create Cycle"}</Button>
        <Button variant="secondary" disabled={pending || uncertain} onClick={cancel}>Cancel</Button>
      </div>
      {canManage && saved && <div className="space-y-ah-16 border-t border-border pt-ah-24">
        {!confirmDelete ? <Button variant="danger" disabled={pending} onClick={() => setConfirmDelete(true)}>Delete Semester</Button> :
          <div role="alert" className="space-y-ah-16 rounded-ah-8 border border-danger p-ah-16">
            <p>Delete {saved.semester.name}? This permanently deletes its evaluation cycle, course sections, teaching assignments, signups, observations, assessments, invitations, reports and feedback, including supporting files. Unsaved changes will be discarded. This cannot be undone.</p>
            <div className="flex flex-wrap gap-ah-16"><Button variant="danger" disabled={pending} onClick={remove}>Permanently Delete Semester</Button><Button variant="secondary" disabled={pending} onClick={() => setConfirmDelete(false)}>Keep Semester</Button></div>
          </div>}
      </div>}
    </form>}
    {message && <p role={success ? "status" : "alert"} className={success ? "text-sidebar" : "text-danger"}>{message}</p>}
    {conflict && !creating && <Button variant="secondary" disabled={pending} onClick={() => { if (canLeave()) void load(selection); }}>Reload latest settings</Button>}
    {conflict && creating && <Button variant="secondary" disabled={pending} onClick={() => setGeneration(v => v + 1)}>Reload semesters</Button>}
  </div>;
}
