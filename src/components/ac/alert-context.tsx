"use client";
import {useCallback,useState} from "react";
import {useApiResource} from "@/components/ac/use-api-resource";
import {Section} from "@/components/ui/section";
import {Button} from "@/components/ui/button";
import {acApi} from "@/lib/ac-api";
export function AlertContext({alertId,observationId}:{alertId:string;observationId?:string}){
 const [attempt,setAttempt]=useState(0);
 const result=useApiResource(useCallback(async()=>{
  void attempt;
  try { return await acApi.getAlert(alertId); }
  catch(error) {
   const status=(error as {status?:number}).status;
   throw new Error(status===401?"Sign in again to review this message.":status===403?"You do not have permission to review this message.":status===404?"This message is no longer available.":"The saved message could not be loaded. Check your connection and try again.");
  }
 },[alertId,attempt]),null);
 const candidate=result.data;
 const alert=candidate?.id===alertId&&(!observationId||candidate.observationId===observationId)?candidate:null;
 return <Section title="Faculty message">
  {result.loading&&!alert?<p role="status">Loading message…</p>:!alert?<div className="space-y-ah-16"><p role="alert" className="text-danger">{result.error ?? "The requested message does not match this observation."}</p><Button variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Try again</Button></div>:<div className="min-w-0 space-y-ah-16 [overflow-wrap:anywhere]">
   <p className="text-label">Submitted by: {alert.createdBy?.name ?? "Sender not recorded"}</p><h3 className="whitespace-pre-wrap text-section">{alert.reason}</h3><p className="whitespace-pre-wrap break-words">{alert.details}</p>
   <p className="text-muted">{alert.context.observee.name} · {alert.context.section.course}.{alert.context.section.sectionNumber} · {alert.context.section.semester.name}</p>
   <p>Observer: {alert.context.observer?.name ?? "Not assigned"} · Observation status: {alert.context.observationStatus}</p>
   {!!alert.context.candidates.length&&<ul className="space-y-ah-8">{alert.context.candidates.map(c=><li key={c.id}>{c.name}: {c.status}</li>)}</ul>}
  </div>}
 </Section>;
}
