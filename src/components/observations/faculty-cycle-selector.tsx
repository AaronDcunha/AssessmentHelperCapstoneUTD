"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/form-fields";
import { postFacultyAction } from "./faculty-api";
import type { FacultyDashboard } from "@/server/queries/faculty-dashboard";

export function FacultyCycleSelector({ dashboard }: { dashboard?: FacultyDashboard | null }) {
  const router = useRouter(), [pending, setPending] = useState(false), [error, setError] = useState("");
  if (!dashboard?.availableCycles || dashboard.availableCycles.length < 2) return null;
  return <div className="space-y-ah-8"><Select label="Evaluation cycle" value={dashboard.cycle?.id ?? ""} disabled={pending} wrapperClassName="max-w-[480px]" onChange={async event => {
    if (!event.target.value) return; setPending(true); setError("");
    try { await postFacultyAction("cycle", { cycleId: event.target.value }); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Cycle selection failed."); }
    finally { setPending(false); }
  }}><option value="">Choose a relevant cycle</option>{dashboard.availableCycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycle.name}</option>)}</Select>{error && <p role="status" className="text-danger">{error}</p>}</div>;
}

export function FacultyObservationSelector({ dashboard }: { dashboard?: FacultyDashboard | null }) {
  const router = useRouter(), [pending, setPending] = useState(false), [error, setError] = useState("");
  if (!dashboard?.availableObservations || dashboard.availableObservations.length < 2) return null;
  return <div className="space-y-ah-8"><Select label="Active observation" value={dashboard.currentObservation?.id ?? ""} disabled={pending} wrapperClassName="max-w-[480px]" onChange={async event => {
    setPending(true); setError("");
    try { await postFacultyAction("observation", { observationId: event.target.value }); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : "Observation selection failed."); }
    finally { setPending(false); }
  }}>{dashboard.availableObservations.map(record => <option key={record.id} value={record.id}>{record.label}</option>)}</Select>{error && <p role="status" className="text-danger">{error}</p>}</div>;
}
