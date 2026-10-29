"use client";
import {useCallback} from "react";
import Link from "next/link";
import {useApiResource} from "./use-api-resource";
import {acApi,type AlertResource} from "@/lib/ac-api";
import {Section} from "@/components/ui/section";
const EMPTY:AlertResource[]=[];
export function CycleAlerts({cycleId}:{cycleId:string|undefined}){
 const result=useApiResource(useCallback(()=>cycleId?acApi.getCycleAlerts(cycleId):Promise.resolve(EMPTY),[cycleId]),EMPTY);
 return <Section title="Faculty messages"><div className="space-y-ah-16">
  {result.loading?<p role="status">Loading messages…</p>:result.error?<p role="alert">Messages are currently unavailable.</p>:!cycleId?<p>Select a single evaluation cycle to view messages.</p>:!result.data.length?<p className="text-muted">No faculty messages in this cycle.</p>:result.data.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-ah-16 border-b border-border pb-ah-12"><div><p className="text-label">{a.reason}</p><p className="text-caption text-muted">{a.createdBy?.name ?? a.context.observee.name}</p></div><Link className="text-label text-sidebar underline" href={`/ac/observations/${encodeURIComponent(a.observationId)}?alertId=${encodeURIComponent(a.id)}`}>View message</Link></div>)}
 </div></Section>;
}
