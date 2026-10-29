"use client";
import {useCallback,useState} from "react";
import {useApiResource} from "@/components/ac/use-api-resource";
import {Section} from "@/components/ui/section";
import {Button} from "@/components/ui/button";
import {acApi} from "@/lib/ac-api";
export function AlertContext({alertId,observationId}:{alertId:string;observationId?:string}){
 const [attempt,setAttempt]=useState(0);
 const result=useApiResource(useCallback(()=>{void attempt;return acApi.getAlert(alertId);},[alertId,attempt]),null);
 const candidate=result.data;
 const alert=candidate?.id===alertId&&(!observationId||candidate.observationId===observationId)?candidate:null;
 return <Section title="Faculty message">
  {result.loading&&!alert?<p role="status">Loading message…</p>:!alert?<div className="space-y-ah-16"><p role="alert">The message is unavailable or you do not have access.</p><Button variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Try again</Button></div>:<div className="space-y-ah-16">
   <p className="text-label">Submitted by: {alert.createdBy?.name ?? "Sender not recorded"}</p><h3 className="text-section">{alert.reason}</h3><p className="whitespace-pre-wrap break-words">{alert.details}</p>
   <p className="text-muted">{alert.context.observee.name} · {alert.context.section.course}.{alert.context.section.sectionNumber} · {alert.context.section.semester.name}</p>
   {!!alert.context.candidates.length&&<ul className="space-y-ah-8">{alert.context.candidates.map(c=><li key={c.id}>{c.name}: {c.status}</li>)}</ul>}
  </div>}
 </Section>;
}
