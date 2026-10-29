"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, type Cycle } from "@/lib/ac-api";
import { configurationError, cycleDeadlines, deadlinePayload, validDateOnly, type Deadlines } from "@/lib/ac-configuration";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";
import { useApiResource } from "@/components/ac/use-api-resource";

type Settings = Deadlines & { startsOn: string; endsOn: string };
const settingsFor = (cycle: Cycle): Settings => ({ ...cycleDeadlines(cycle), startsOn: cycle.semester?.startsOn ?? "", endsOn: cycle.semester?.endsOn ?? "" });

function SettingsForm({ loaded }: { loaded: Cycle }) {
  const { refreshCycles, selectCycle } = useAcCycle();
  const [baseline, setBaseline] = useState(loaded);
  const [settings, setSettings] = useState(() => settingsFor(loaded));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const allowed = baseline.allowedActions?.includes("updateSettings");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current || !allowed) return;
    setMessage(null); setSuccess(false); setConflict(false);
    try {
      if (!validDateOnly(settings.startsOn) || !validDateOnly(settings.endsOn) || settings.startsOn > settings.endsOn) throw new Error("Enter valid semester dates, with start on or before end.");
      if (!baseline.semester?.timeZone || typeof baseline.revision !== "number" || typeof baseline.semester.revision !== "number") throw new Error("Semester zone or revisions are missing. Reload settings before saving.");
      const deadlines = deadlinePayload(settings, baseline.semester.timeZone, baseline);
      busy.current = true; setSaving(true);
      const result = await acApi.updateCycleSettings(baseline.id, {
        expectedCycleRevision: baseline.revision, expectedSemesterRevision: baseline.semester.revision,
        semester: { startsOn: settings.startsOn, endsOn: settings.endsOn }, deadlines,
      });
      if (!active.current) return;
      const saved = { ...result.cycle, semester: result.semester };
      setBaseline(saved); setSettings(settingsFor(saved)); setSuccess(true); setMessage("Settings saved."); selectCycle(saved.id); refreshCycles();
    } catch (error) { if (active.current) { setMessage(configurationError(error)); setConflict((error as { status?: number }).status === 409); } }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }
  async function reload() {
    if (!window.confirm("Discard edits and load the latest saved settings?")) return;
    if (busy.current) return; busy.current = true; setSaving(true);
    try { const latest = await acApi.getEvaluationCycle(baseline.id); if (active.current) { setBaseline(latest); setSettings(settingsFor(latest)); setMessage(null); setConflict(false); } }
    catch (error) { if (active.current) { setSuccess(false); setMessage(configurationError(error)); } }
    finally { busy.current = false; if (active.current) setSaving(false); }
  }
  function bind(name: keyof Settings) {
    return { value: settings[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => { setSuccess(false); setMessage(null); setSettings(current => ({ ...current, [name]: event.target.value })); } };
  }

  return <form className="space-y-ah-24" onSubmit={submit} aria-busy={saving}>
    <Section title="Semester dates and deadlines" description={`Deadline times are in ${baseline.semester?.timeZone}. Semester boundaries are dates; deadlines include an exact time.`} contentClassName="space-y-ah-16">
      {(!baseline.semester?.startsOn || !baseline.semester?.endsOn) && <p className="text-warning">Semester boundaries have not been configured. Enter the actual academic dates.</p>}
      {!allowed && <p className="text-warning">You cannot change these settings.</p>}
      <fieldset disabled={saving || !allowed} className="grid min-w-0 grid-cols-1 gap-x-ah-24 gap-y-ah-16 md:grid-cols-2">
        <Input label="Semester" name="semester" className="h-control-56" value={baseline.semester?.name ?? "Unavailable"} readOnly />
        <Input label="Signup Deadline" name="signupDeadline" type="datetime-local" step="1" required {...bind("signupDeadline")} />
        <Input label="Semester Start" name="startsOn" type="date" className="h-control-56" required {...bind("startsOn")} />
        <Input label="Observation Deadline" name="observationDeadline" type="datetime-local" step="1" required {...bind("observationDeadline")} />
        <Input label="Semester End" name="endsOn" type="date" className="h-control-56" required {...bind("endsOn")} />
        <Input label="Feedback Deadline" name="feedbackDeadline" type="datetime-local" step="1" required {...bind("feedbackDeadline")} />
      </fieldset>
      <p className="text-caption text-muted">Signup must be before observation, then feedback. Feedback can be after semester end. Unchanged deadlines retain their exact saved times.</p>
    </Section>
    {message && <p className={success ? "text-sidebar" : "text-danger"} role={success ? "status" : "alert"}>{message}</p>}
    {conflict && <Button variant="secondary" disabled={saving} onClick={reload}>Reload latest settings</Button>}
    <div className="flex flex-wrap gap-ah-16">
      <Button variant="secondary" className="w-[260px]" disabled={saving} onClick={() => { setSettings(settingsFor(baseline)); setMessage(null); setConflict(false); }}>Cancel</Button>
      <Button type="submit" className="w-[260px]" disabled={saving || !allowed}>{saving ? "Saving…" : "Save Settings"}</Button>
    </div>
  </form>;
}

function SelectedSettings({ cycleId }: { cycleId: string }) {
  const [retry, setRetry] = useState(0);
  const result = useApiResource(useCallback(async () => {
    void retry; // Explicit reload creates a new resource request.
    try { const cycle = await acApi.getEvaluationCycle(cycleId); cycleDeadlines(cycle); return cycle; }
    catch (error) { throw new Error(configurationError(error)); }
  }, [cycleId, retry]), null);
  if (result.loading) return <p role="status">Loading semester settings…</p>;
  if (result.error) return <div className="space-y-ah-16"><p role="alert" className="text-danger">{result.error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry settings</Button></div>;
  return result.data && <SettingsForm key={`${cycleId}-${retry}`} loaded={result.data} />;
}
export default function SemesterSettingsPage() {
  const { selectedCycle, selection, loading } = useAcCycle();
  // Keep an already loaded form mounted while context refreshes after saving.
  const id = selectedCycle?.id ?? (loading ? selection : "");
  return <div className="space-y-ah-24"><CycleSelector />{id && id !== "all" && <SelectedSettings key={id} cycleId={id} />}</div>;
}
