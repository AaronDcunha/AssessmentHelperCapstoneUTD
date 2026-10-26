"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { acApi, cycleDisplayName, type Cycle } from "@/lib/ac-api";
import { Select } from "@/components/ui/form-fields";
import { useApiResource } from "./use-api-resource";

const EMPTY_CYCLES: Cycle[] = [];
type CycleContextValue = {
  cycles: Cycle[]; selectedCycle: Cycle | null; selection: string;
  selectCycle: (id: string) => void; loading: boolean; error: string | null;
};
const CycleContext = createContext<CycleContextValue | null>(null);

export function AcCycleProvider({ children, canReadCycles }: { children: ReactNode; canReadCycles: boolean }) {
  const result = useApiResource(useCallback(() => canReadCycles ? acApi.getEvaluationCycles() : Promise.resolve(EMPTY_CYCLES), [canReadCycles]), EMPTY_CYCLES);
  const [selection, selectCycle] = useState("");
  // A sole cycle is unambiguous. With multiple cycles, require an explicit choice;
  // never infer a "current" cycle from dates or list ordering.
  const effective = selection || (result.data.length === 1 ? result.data[0].id : "");
  const selectedCycle = result.data.find(cycle => cycle.id === effective) ?? null;
  return <CycleContext.Provider value={{ cycles: result.data, selection: effective, selectCycle, selectedCycle, loading: result.loading, error: result.error }}>
    {children}
  </CycleContext.Provider>;
}

export function useAcCycle() {
  const context = useContext(CycleContext);
  if (!context) throw new Error("AC cycle selection requires AcCycleProvider.");
  return context;
}

export function CycleSelector({ allowAll = false }: { allowAll?: boolean }) {
  const { cycles, selection, selectCycle, selectedCycle, loading, error } = useAcCycle();
  return <div className="max-w-[480px] space-y-ah-8">
    <Select label="Evaluation cycle" name="cycleId" value={selectedCycle ? selectedCycle.id : allowAll && selection === "all" ? "all" : ""}
      onChange={event => selectCycle(event.target.value)} disabled={loading || !!error || cycles.length === 0} className="h-control-56">
      <option value="">{loading ? "Loading cycles…" : "Select an evaluation cycle"}</option>
      {allowAll && cycles.length > 0 && <option value="all">All semesters</option>}
      {cycles.map(cycle => <option key={cycle.id} value={cycle.id}>{cycleDisplayName(cycle)}</option>)}
    </Select>
    <p className="text-caption text-muted" role="status">
      {error ? "Evaluation cycles are currently unavailable." : loading ? "Loading evaluation cycles…" : cycles.length === 0 ? "No evaluation cycles are available." : !selectedCycle && !(allowAll && selection === "all") ? "Select a cycle to load its data." : null}
    </p>
  </div>;
}
