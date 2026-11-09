"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, ApiRequestError, type Cycle, type Semester } from "@/lib/ac-api";
import { configurationError, defaultSemesterDeadlines, cycleDeadlines, deadlineKeys, deadlinePayload, validDateOnly, type Deadlines } from "@/lib/ac-configuration";
import { currentSemester } from "@/lib/observer-selection";
import { guardUnsavedNavigation } from "@/lib/unsaved-navigation";
import { useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";

type Settings = Deadlines & { year: string; season: string; startsOn: string; endsOn: string; timeZone: string };
type Loaded = { semesters: Semester[]; cycles: Cycle[] };
const EMPTY: Loaded & { initialSemesterId?: string } = { semesters: [], cycles: [] };
function settingsFor(semester?: Semester, cycle?: Cycle): Settings {
  return { year: String(semester?.year ?? new Date().getFullYear()), season: semester?.season ?? "Spring", startsOn: semester?.startsOn ?? "", endsOn: semester?.endsOn ?? "", timeZone: semester?.timeZone ?? "America/Chicago", ...(cycle ? cycleDeadlines(cycle) : defaultSemesterDeadlines(semester?.startsOn ?? "", semester?.endsOn ?? "")) };
}
function order(semester: Semester) {
  return (semester.year ?? Number(semester.name.match(/\b\d{4}\b/)?.[0] ?? 0)) * 10 + ({ Spring: 1, Summer: 2, Fall: 3 }[semester.season ?? semester.name.split(" ")[0]] ?? 0);
}
function SemesterForm({ semester, cycle, canManage, leaveRef, onSaved, onDeleted, onCancel }: { semester?: Semester; cycle?: Cycle; canManage: boolean; leaveRef: React.MutableRefObject<() => boolean>; onSaved: (semester: Semester, cycle: Cycle) => void; onDeleted: () => void; onCancel: () => void }) {
  const [baseline, setBaseline] = useState({ semester, cycle });
  const [settings, setSettings] = useState(() => settingsFor(semester, cycle));
  const [saving, setSaving] = useState(false), [uncertain, setUncertain] = useState(false);
  const [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const busy = useRef(false), request = useRef<null | (() => Promise<{ semester: Semester; cycle: Cycle }>)>(null);
  const dirty = JSON.stringify(settings) !== JSON.stringify(settingsFor(baseline.semester, baseline.cycle));
  const allowed = canManage && (!baseline.cycle || !!baseline.cycle.allowedActions?.includes("updateSettings"));
  useEffect(() => {
    leaveRef.current = () => !busy.current && !uncertain && (!dirty || window.confirm("Discard unsaved semester changes?"));
    return () => { leaveRef.current = () => true; };
  }, [dirty, uncertain, leaveRef]);
  useEffect(() => dirty || uncertain ? guardUnsavedNavigation(window, document, "Leave with unsaved semester changes? Retry any uncertain creation before leaving.") : undefined, [dirty, uncertain]);
  function change(name: keyof Settings, value: string) {
    setMessage("");
    setSettings(current => {
      const next = { ...current, [name]: value };
      if (!baseline.cycle) {
        if (name === "startsOn" && (!current.signupDeadline || current.signupDeadline === `${current.startsOn}T12:00`)) next.signupDeadline = value ? `${value}T12:00` : "";
        if (name === "endsOn" && validDateOnly(value)) {
          const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 7);
          if (!current.observationDeadline || current.observationDeadline === `${current.endsOn}T12:00`) next.observationDeadline = `${value}T12:00`;
          const old = validDateOnly(current.endsOn) ? new Date(`${current.endsOn}T12:00:00Z`) : null;
          old?.setUTCDate(old.getUTCDate() + 7);
          if (!current.feedbackDeadline || current.feedbackDeadline === `${old?.toISOString().slice(0, 10)}T12:00`) next.feedbackDeadline = `${date.toISOString().slice(0, 10)}T12:00`;
        }
      }
      return next;
    });
  }
  const bind = (name: keyof Settings) => ({ value: settings[name], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => change(name, event.target.value) });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || !allowed) return;
    setMessage(""); setConflict(false);
    try {
      if (!request.current) {
        if (!validDateOnly(settings.startsOn) || !validDateOnly(settings.endsOn) || settings.startsOn > settings.endsOn) throw new Error("Enter valid ordered semester dates.");
        const deadlines = deadlinePayload(settings, settings.timeZone, settings.timeZone === baseline.semester?.timeZone ? baseline.cycle : undefined);
        const dates = { startsOn: settings.startsOn, endsOn: settings.endsOn, timeZone: settings.timeZone };
        const original = baseline.semester, originalCycle = baseline.cycle;
        if (originalCycle && original) {
          request.current = async () => {
            const result = await acApi.updateCycleSettings(originalCycle.id, { expectedCycleRevision: originalCycle.revision!, expectedSemesterRevision: original.revision, semester: dates, deadlines });
            return { semester: result.semester as Semester, cycle: result.cycle };
          };
        } else if (original) {
          const payload = { semesterId: original.id, ...deadlines, semester: dates, expectedSemesterRevision: original.revision, creationId: crypto.randomUUID() };
          request.current = async () => { const saved = await acApi.createCycle(payload); return { semester: saved.semester as Semester, cycle: saved }; };
        } else {
          const payload = { year: Number(settings.year), season: settings.season, ...dates, deadlines, creationId: crypto.randomUUID() };
          request.current = async () => {
            const saved = await acApi.createSemester(payload);
            const cycles = await acApi.getEvaluationCycles({ semesterId: saved.id });
            if (!cycles[0]) throw new Error("Semester creation could not be verified. Retry the same creation.");
            return { semester: saved, cycle: cycles[0] };
          };
        }
      }
      busy.current = true; setSaving(true);
      const saved = await request.current(); request.current = null;
      setUncertain(false); setBaseline(saved); setSettings(settingsFor(saved.semester, saved.cycle)); setMessage("Settings saved."); onSaved(saved.semester, saved.cycle);
    } catch (error) {
      const creation = !baseline.cycle;
      // Keep the exact creation UUID and payload after an uncertain server/network result.
      const retryOriginal = creation && !!request.current && (!(error instanceof ApiRequestError) || !error.status || error.status >= 500 || error.code === "CONCURRENT_UPDATE");
      setUncertain(retryOriginal); if (!retryOriginal) request.current = null;
      setMessage(configurationError(error)); setConflict(error instanceof ApiRequestError && error.status === 409 && !retryOriginal);
    } finally { busy.current = false; setSaving(false); }
  }
  async function reload() {
    if (busy.current || !baseline.semester || !window.confirm("Discard edits and load the latest saved settings?")) return;
    busy.current = true; setSaving(true);
    try {
      const [semesters, cycles] = await Promise.all([acApi.getSemesters(), acApi.getEvaluationCycles({ semesterId: baseline.semester.id })]);
      const latest = semesters.find(item => item.id === baseline.semester!.id);
      if (!latest) { onDeleted(); return; }
      setBaseline({ semester: latest, cycle: cycles[0] }); setSettings(settingsFor(latest, cycles[0])); setConflict(false); setMessage("");
    } catch (error) { setMessage(configurationError(error)); }
    finally { busy.current = false; setSaving(false); }
  }
  return <form onSubmit={submit} className="space-y-ah-24" aria-busy={saving}>
    <Section title={baseline.semester ? baseline.semester.name : "New Semester"} description="Semester dates and evaluation deadlines" contentClassName="space-y-ah-16">
      {!baseline.cycle && <p className="text-muted">Saving creates an evaluation cycle with this semester. Suggested deadlines are editable: signup at noon on the start date, observation at noon on the end date, feedback at noon seven days later.</p>}
      {!allowed && <p className="text-warning">You cannot change these settings.</p>}
      <fieldset disabled={saving || uncertain || !allowed} className="grid min-w-0 grid-cols-1 gap-ah-16 md:grid-cols-2">
        {!baseline.semester && <><Select label="Season" name="season" {...bind("season")}><option>Spring</option><option>Summer</option><option>Fall</option></Select><Input label="Year" name="year" type="number" min="2000" max="2099" required {...bind("year")} /></>}
        <Input label="Semester Start" name="startsOn" type="date" required {...bind("startsOn")} />
        <Input label="Semester End" name="endsOn" type="date" required {...bind("endsOn")} />
        <Input label="Time zone" name="timeZone" required hint="IANA zone, for example America/Chicago. Deadline times use this zone." {...bind("timeZone")} />
        {deadlineKeys.map(key => <Input key={key} label={{ signupDeadline: "Signup Deadline", observationDeadline: "Observation Deadline", feedbackDeadline: "Feedback Deadline" }[key]} name={key} type="datetime-local" step="1" required {...bind(key)} />)}
      </fieldset>
      <p className="text-caption text-muted">Signup must be before observation, then feedback. Feedback can follow semester end. Unchanged deadlines retain their exact saved times.</p>
    </Section>
    {message && <p role={message === "Settings saved." ? "status" : "alert"} className={message === "Settings saved." ? "text-sidebar" : "text-danger"}>{message}</p>}
    {uncertain && <p role="alert" className="text-warning">Creation may have succeeded. Retry the original creation to recover it before changing fields or semesters.</p>}
    {conflict && <Button variant="secondary" disabled={saving} onClick={reload}>Reload latest settings</Button>}
    <div className="flex flex-wrap gap-ah-16">
      <Button type="submit" disabled={saving || !allowed}>{saving ? "Saving?" : uncertain ? "Retry creation" : baseline.semester ? baseline.cycle ? "Save Settings" : "Save and Create Cycle" : "Create Semester"}</Button>
      <Button variant="secondary" disabled={saving || uncertain} onClick={() => { if (!baseline.semester) onCancel(); else { setSettings(settingsFor(baseline.semester, baseline.cycle)); setMessage(""); setConflict(false); } }}>Cancel</Button>
    </div>
  </form>;
}
export default function SemesterSettingsPage({ canManage = false }: { canManage?: boolean }) {
  const { refreshCycles, selectCycle, selectedCycle } = useAcCycle();
  const [retry, setRetry] = useState(0), [chosenSemester, setSelection] = useState<string | null>(null), [rows, setRows] = useState<Loaded | null>(null);
  const leaveRef = useRef<() => boolean>(() => true);
  const [notice, setNotice] = useState("");
  const resource = useApiResource(useCallback(async () => { void retry; const [semesters, cycles] = await Promise.all([acApi.getSemesters(), acApi.getEvaluationCycles()]); return { semesters, cycles, initialSemesterId: currentSemester(semesters, item => item, Date.now())?.id }; }, [retry]), EMPTY);
  const data = rows ?? resource.data;
  const selection = chosenSemester ?? resource.data.initialSemesterId ?? "";
  const semester = data.semesters.find(item => item.id === selection);
  const cycle = data.cycles.find(item => item.semester?.id === selection);
  function switchTo(id: string) { if (id !== selection && leaveRef.current()) { setSelection(id); setNotice(""); } }
  return <div className="space-y-ah-24">
    <div className="flex flex-col gap-ah-16 md:flex-row md:items-end">
      <Select label="Semester" wrapperClassName="min-w-0 md:w-[360px]" value={selection === "new" ? "" : selection} disabled={resource.loading || !!resource.error} onChange={event => switchTo(event.target.value)}><option value="">Select a semester</option>{[...data.semesters].sort((a, b) => order(b) - order(a) || b.name.localeCompare(a.name)).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
      {canManage && <Button variant="secondary" disabled={resource.loading || !!resource.error} onClick={() => switchTo("new")}>New Semester</Button>}
    </div>
    {notice && <p role="status">{notice}</p>}
    {resource.loading && <p role="status">Loading semesters and settings?</p>}
    {resource.error && <div className="space-y-ah-16"><p role="alert" className="text-danger">{configurationError(new Error(resource.error))}</p><Button variant="secondary" onClick={() => { setRows(null); setRetry(value => value + 1); }}>Retry semesters</Button></div>}
    {!resource.loading && !resource.error && !data.semesters.length && selection !== "new" && <p>No semesters yet. Create a semester to configure its evaluation cycle.</p>}
    {(selection === "new" || semester) && <SemesterForm key={selection} semester={semester} cycle={cycle} canManage={canManage} leaveRef={leaveRef} onCancel={() => setSelection("")} onDeleted={() => { setNotice("Semester removed. Select another semester or create a new one."); setRows({ semesters: data.semesters.filter(item => item.id !== selection), cycles: data.cycles.filter(item => item.semester?.id !== selection) }); setSelection(""); if (selectedCycle?.semester?.id === selection) selectCycle(""); refreshCycles(); }} onSaved={(saved, savedCycle) => { if (selection === "new") setNotice(saved.name + " created."); setRows({ semesters: [...data.semesters.filter(item => item.id !== saved.id), saved], cycles: [...data.cycles.filter(item => item.semester?.id !== saved.id), savedCycle] }); setSelection(saved.id); selectCycle(savedCycle.id); refreshCycles(); }} />}
  </div>;
}
