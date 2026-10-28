import { getCurrentUser } from "./permissions";
import { getPrisma } from "./prisma";
import { workflowHandler,type WorkflowOperation } from "./alert-reminder-http";
import { createObservationAlert,updateAlert } from "./services/alerts";
import { getAlert,getCycleAlerts } from "./queries/alerts";
import { sendCycleReminders } from "./services/cycle-reminders";
export function workflowApi(operation:WorkflowOperation){
 return workflowHandler(operation,{getUser:getCurrentUser,execute:(user,id,url,body,key)=>getPrisma().$transaction(async tx=>{
  if(operation==="alert.create")return createObservationAlert(tx,user,id,body);
  if(operation==="alert.get")return getAlert(tx,user,id);
  if(operation==="alert.list")return getCycleAlerts(tx,user,id,url);
  if(operation==="alert.update")return updateAlert(tx,user,id,body);
  return sendCycleReminders(tx,user,id,body,key);
 },{isolationLevel:"Serializable",timeout:30000})});
}
