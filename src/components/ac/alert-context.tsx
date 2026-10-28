"use client";
import { notifyNotificationChange } from "@/lib/notifications-api";
import {useCallback,useState} from "react";
import {useApiResource} from "@/components/ac/use-api-resource";
import {Section} from "@/components/ui/section";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/form-fields";
import {acApi,type AlertResource} from "@/lib/ac-api";
export function AlertContext({alertId,observationId}:{alertId:string;observationId?:string}){
 const [attempt,setAttempt]=useState(0),[updated,setUpdated]=useState<AlertResource|null>(null),[pending,setPending]=useState(false),[note,setNote]=useState(""),[error,setError]=useState<string|null>(null);
 const result=useApiResource(useCallback(()=>{void attempt;return acApi.getAlert(alertId);},[alertId,attempt]),null);
 const candidate=updated?.id===alertId?updated:result.data;
 const alert=candidate?.id===alertId&&(!observationId||candidate.observationId===observationId)?candidate:null;
 async function change(status:"acknowledged"|"resolved"){
  if(!alert||pending)return;setPending(true);setError(null);
  try{setUpdated(await acApi.updateAlert(alert.id,{status,expectedRevision:alert.revision,...(note.trim()?{resolutionNote:note.trim()}:{})}));notifyNotificationChange();}
  catch(e){setError(e instanceof Error?e.message:"The alert could not be updated.");}
  finally{setPending(false);}
 }
 return <Section title="Faculty alert">
  {result.loading&&!alert?<p role="status">Loading alert…</p>:!alert?<div className="space-y-ah-16"><p role="alert">The alert is unavailable or you do not have access.</p><Button variant="secondary" onClick={()=>setAttempt(n=>n+1)}>Try again</Button></div>:<div className="space-y-ah-16">
   <p className="text-label">Submitted by: {alert.createdBy?.name ?? "Sender not recorded"}</p><p className="text-label">Status: {alert.status}</p><h3 className="text-section">{alert.reason}</h3><p className="whitespace-pre-wrap break-words">{alert.details}</p>
   <p className="text-muted">{alert.context.observee.name} · {alert.context.section.course}.{alert.context.section.sectionNumber} · {alert.context.section.semester.name}</p>
   {!!alert.context.candidates.length&&<ul className="space-y-ah-8">{alert.context.candidates.map(c=><li key={c.id}>{c.name}: {c.status}</li>)}</ul>}
   {alert.resolutionNote&&<p className="whitespace-pre-wrap">Resolution: {alert.resolutionNote}</p>}
   {alert.allowedActions.includes("resolve")&&<Textarea label="Resolution note (optional)" maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} disabled={pending}/>}
   <div className="flex flex-wrap gap-ah-16">{alert.allowedActions.includes("acknowledge")&&<Button disabled={pending} onClick={()=>{void change("acknowledged");}}>Acknowledge alert</Button>}{alert.allowedActions.includes("resolve")&&<Button disabled={pending} onClick={()=>{void change("resolved");}}>Resolve alert</Button>}</div>
   {error&&<div className="space-y-ah-12"><p role="alert">{error}</p><Button variant="secondary" disabled={pending} onClick={()=>{setUpdated(null);setError(null);setAttempt(n=>n+1);}}>Reload alert</Button></div>}
  </div>}
 </Section>;
}
