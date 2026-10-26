"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, type CycleWrite } from "@/lib/ac-api";

const EMPTY_FORM: CycleWrite = { semesterId: "", signupDeadline: "", observationDeadline: "", feedbackDeadline: "" };

export function CycleForm({ mode, cycleId }: { mode: "create" | "edit"; cycleId?: string }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(mode === "edit");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "edit" || !cycleId) return;
    let active = true;
    acApi.getEvaluationCycle(cycleId).then((cycle) => {
      if (!active) return;
      setRevision(cycle.revision ?? 0);
      setForm({ semesterId: cycle.semesterId ?? "", signupDeadline: cycle.signupDeadline ?? "", observationDeadline: cycle.observationDeadline ?? "", feedbackDeadline: cycle.feedbackDeadline ?? "" });
    }).catch(() => { if (active) setMessage("Cycle data is currently unavailable. You can still review the form layout."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [cycleId, mode]);

  function field(name: keyof CycleWrite) {
    return { value: form[name], onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm((current) => ({ ...current, [name]: event.target.value })) };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      if (mode === "create") await acApi.createCycle(form);
      else if (cycleId) await acApi.updateCycle(cycleId, { ...form, expectedRevision: revision });
      setMessage(mode === "create" ? "Cycle created." : "Cycle updated.");
    } catch {
      setMessage("Unable to save the cycle because the API endpoint is not available yet.");
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit}>
      <Section title={mode === "create" ? "Create Cycle" : "Edit Cycle"} description="Configure the semester and the three evaluation-cycle deadlines."
        contentClassName="space-y-ah-24">
        <div className="grid grid-cols-1 gap-ah-16 md:grid-cols-2">
          <Input label="Semester ID" name="semesterId" required {...field("semesterId")} />
          <Input label="Signup deadline" name="signupDeadline" type="datetime-local" required {...field("signupDeadline")} />
          <Input label="Observation deadline" name="observationDeadline" type="datetime-local" required {...field("observationDeadline")} />
          <Input label="Feedback deadline" name="feedbackDeadline" type="datetime-local" required {...field("feedbackDeadline")} />
        </div>
        {message && <p className="text-body text-muted" role="status">{message}</p>}
        <div className="flex flex-wrap gap-ah-16">
          <Button type="submit" className="w-[200px]" disabled={loading}>{loading ? "Saving…" : mode === "create" ? "Create Cycle" : "Save Changes"}</Button>
          <ButtonLink href="/ac/cycles" variant="secondary" className="w-[200px]">Cancel</ButtonLink>
        </div>
      </Section>
    </form>
  );
}
