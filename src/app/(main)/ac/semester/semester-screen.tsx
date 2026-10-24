"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { acApi } from "@/lib/ac-api";
import { CycleSelector, useAcCycle } from "@/components/ac/cycle-context";

type Settings = { semester: string; signupDeadline: string; semesterStart: string; observationDeadline: string; semesterEnd: string; feedbackDeadline: string };
const EMPTY_SETTINGS: Settings = { semester: "", signupDeadline: "", semesterStart: "", observationDeadline: "", semesterEnd: "", feedbackDeadline: "" };

function SettingsForm({ cycleId }: { cycleId: string }) {
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [cycleRevision, setCycleRevision] = useState(0);
  const [semesterRevision, setSemesterRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    acApi.getEvaluationCycle(cycleId).then((cycle) => {
      if (!active) return;
      setCycleRevision(cycle.revision ?? 0);
      setSemesterRevision(cycle.semester?.revision ?? 0);
      setSettings({
        semester: cycle.semester?.title || cycle.semester?.name || "",
        signupDeadline: cycle.signupDeadline ?? "", semesterStart: cycle.semester?.startsOn ?? "",
        observationDeadline: cycle.observationDeadline ?? "", semesterEnd: cycle.semester?.endsOn ?? "",
        feedbackDeadline: cycle.feedbackDeadline ?? "",
      });
    }).catch(() => { if (active) setMessage("Semester settings are currently unavailable. Default values are shown."); });
    return () => { active = false; };
  }, [cycleId]);

  function bind(name: keyof Settings) {
    return { value: settings[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSettings((current) => ({ ...current, [name]: event.target.value })) };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage(null);
    try {
      await acApi.updateCycleSettings(cycleId, {
        expectedCycleRevision: cycleRevision, expectedSemesterRevision: semesterRevision,
        semester: { startsOn: settings.semesterStart, endsOn: settings.semesterEnd },
        deadlines: { signupDeadline: settings.signupDeadline, observationDeadline: settings.observationDeadline, feedbackDeadline: settings.feedbackDeadline },
      });
      setMessage("Settings saved.");
    } catch { setMessage("Unable to save settings because the API endpoint is not available yet."); }
    finally { setSaving(false); }
  }

  return (
    <form className="space-y-ah-24" onSubmit={submit}>
      <div className="min-h-[346px] rounded-ah-8 border border-border bg-surface p-ah-24">
        <div className="grid max-w-[984px] grid-cols-1 gap-x-ah-24 gap-y-ah-16 md:grid-cols-2">
          <Input label="Semester" name="semester" className="h-control-56" wrapperClassName="min-h-[88px]" {...bind("semester")} />
          <Input label="Signup Deadline" name="signupDeadline" type="date" className="h-control-56" wrapperClassName="min-h-[88px]" {...bind("signupDeadline")} />
          <Input label="Semester Start" name="semesterStart" type="date" className="h-control-56" wrapperClassName="min-h-[88px]" {...bind("semesterStart")} />
          <Input label="Observation Deadline" name="observationDeadline" type="date" className="h-control-56" wrapperClassName="min-h-[88px]" {...bind("observationDeadline")} />
          <Input label="Semester End" name="semesterEnd" type="date" className="h-control-56" wrapperClassName="min-h-[88px]" {...bind("semesterEnd")} />
          <Input label="Feedback Deadline" name="feedbackDeadline" type="date" className="h-control-56" wrapperClassName="min-h-[88px]" {...bind("feedbackDeadline")} />
        </div>
      </div>
      {message && <p className="text-body text-muted" role="status">{message}</p>}
      <div className="flex flex-wrap gap-ah-16">
        <Button variant="secondary" className="w-[260px]" onClick={() => setSettings(EMPTY_SETTINGS)}>Cancel</Button>
        <Button type="submit" className="w-[260px]" disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>
      </div>
    </form>
  );
}

export default function SemesterSettingsPage() {
  const { selectedCycle } = useAcCycle();
  return <div className="space-y-ah-24">
    <CycleSelector />
    {selectedCycle && <SettingsForm key={selectedCycle.id} cycleId={selectedCycle.id} />}
  </div>;
}
