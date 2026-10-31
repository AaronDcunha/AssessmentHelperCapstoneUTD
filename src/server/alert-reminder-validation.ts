import { ConfigurationError, fields, object, text, uuid, type ConfigurationUser } from "./configuration-validation";
export function workflowGrant(user:ConfigurationUser,...grants:string[]) {
  if(!grants.every(grant=>user.permissions.includes(grant)))throw new ConfigurationError(403,"FORBIDDEN","Permission denied.");
}
export function alertCreation(value:unknown){
  const b=object(value);fields(b,["reasonCode","reason","details","creationKey"]);
  if(b.reasonCode!=="OTHER")throw new ConfigurationError(422,"VALIDATION_ERROR","Only the generic OTHER reason code is currently supported; supply your reason as free text.");
  if(typeof b.details!=="string"||b.details.length>20000)throw new ConfigurationError(422,"VALIDATION_ERROR","Provide details of at most 20000 characters.");
  return {reason:b.reason===undefined?"Faculty assistance requested":text(b.reason),details:b.details,...(b.creationKey===undefined?{}:{creationKey:uuid(b.creationKey)})};
}
export function alertFilters(url:URL){
  for(const k of url.searchParams.keys())if(!["type","departmentId","cursor","limit"].includes(k)||url.searchParams.getAll(k).length!==1||!url.searchParams.get(k)?.trim())throw new ConfigurationError(400,"INVALID_QUERY","Invalid alert filters.");
  const type=url.searchParams.get("type");
  if(type&&type!=="ALERT")throw new ConfigurationError(422,"VALIDATION_ERROR","Invalid message type.");
  return {departmentId:url.searchParams.has("departmentId")?uuid(url.searchParams.get("departmentId")):null};
}
export function reminderInput(value:unknown){
  const b=object(value);fields(b,["kind","recipientFilter","channels","message"]);
  if(typeof b.kind!=="string"||!/^[a-z][a-z0-9_-]{0,49}$/.test(b.kind))throw new ConfigurationError(422,"VALIDATION_ERROR","Provide a reminder kind using lowercase letters, digits, underscores or hyphens.");
  const f=object(b.recipientFilter);fields(f,["evaluationStatus","observationStatus","departmentId","hiringLevelId","professorIds","q"]);
  if(b.channels!==undefined&&(!Array.isArray(b.channels)||!b.channels.length||new Set(b.channels).size!==b.channels.length||b.channels.some(x=>!["inApp","email"].includes(x))))throw new ConfigurationError(422,"VALIDATION_ERROR","Choose supported delivery channels.");
  const params=new URLSearchParams();
  if(f.q!==undefined){if(typeof f.q!=="string"||!f.q.trim()||f.q.trim().length>200)throw new ConfigurationError(422,"VALIDATION_ERROR","Search must contain 1 to 200 characters.");params.set("q",f.q.trim());}
  for(const key of ["departmentId","hiringLevelId"])if(f[key]!==undefined)params.set(key,uuid(f[key]));
  if(f.evaluationStatus!==undefined){if(!["due","overdue","not_due","needs-review","unavailable"].includes(String(f.evaluationStatus)))throw new ConfigurationError(422,"VALIDATION_ERROR","Invalid evaluation status.");params.set("evaluationStatus",String(f.evaluationStatus));}
  if(f.observationStatus!==undefined){if(typeof f.observationStatus!=="string"||!(["in-progress","complete","incomplete","unmatched"].includes(f.observationStatus)||/^[A-Z][A-Z_]{0,49}$/.test(f.observationStatus)))throw new ConfigurationError(422,"VALIDATION_ERROR","Invalid observation status.");params.set("status",f.observationStatus);}
  let ids:string[]|null=null;
  if(f.professorIds!==undefined){if(!Array.isArray(f.professorIds)||f.professorIds.length>1000)throw new ConfigurationError(422,"VALIDATION_ERROR","Choose at most 1000 professors.");ids=f.professorIds.map(uuid);if(new Set(ids).size!==ids.length)throw new ConfigurationError(422,"VALIDATION_ERROR","Duplicate professor IDs.");}
  return {kind:b.kind,params,ids,channels:(b.channels??["inApp","email"]) as ("inApp"|"email")[],message:b.message===undefined?"Please review your evaluation-cycle tasks.":text(b.message)};
}
