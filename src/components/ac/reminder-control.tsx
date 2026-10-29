"use client";
import { notifyNotificationChange } from "@/lib/notifications-api";
import {useRef,useState} from "react";
import {Button} from "@/components/ui/button";
import {Textarea} from "@/components/ui/form-fields";
import {acApi} from "@/lib/ac-api";
export function ReminderControl({cycleId,recipientFilter,canSend}:{cycleId:string|undefined;recipientFilter:Record<string,unknown>;canSend:boolean}){
 const [opened,setOpened]=useState(false),[message,setMessage]=useState(""),[pending,setPending]=useState(false),[feedback,setFeedback]=useState("");
 const request=useRef<{body:string;key:string}|null>(null);
 if(!canSend)return null;
 return <div className="space-y-ah-16"><Button variant="secondary" disabled={!cycleId||pending} onClick={()=>setOpened(!opened)}>Send reminder</Button>
  {opened&&<form className="space-y-ah-16 rounded-ah-8 border border-border bg-surface p-ah-24" onSubmit={async e=>{
   e.preventDefault();if(!cycleId||pending)return;setPending(true);setFeedback("");
   const body={kind:"custom",recipientFilter,channels:["inApp","email"],message},serialized=JSON.stringify({cycleId,...body});
   if(request.current?.body!==serialized)request.current={body:serialized,key:crypto.randomUUID()};
   try{const result=await acApi.sendReminders(cycleId,body,request.current.key);notifyNotificationChange();setFeedback(`Reminder delivered in-app to ${result.recipientCount} faculty members. ${result.emailQueuedCount} emails queued.`);setOpened(false);request.current=null;}
   catch(error){setFeedback(error instanceof Error?error.message:"The reminder outcome is unknown. Retry without editing to reuse the same request key.");}
   finally{setPending(false);}
  }}><p className="text-body text-muted">Send an in-app reminder and queue an email to active faculty matching the current filters.</p><Textarea label="Reminder message" required maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)} disabled={pending}/><Button type="submit" disabled={pending||!message.trim()}>{pending?"Sending…":"Send to matching faculty"}</Button></form>}
  {feedback&&<p role="status">{feedback}</p>}
 </div>;
}
