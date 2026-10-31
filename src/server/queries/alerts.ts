import type { Prisma } from "../../generated/prisma/client";
import { ConfigurationError,pagination,uuid,type ConfigurationUser } from "../configuration-validation";
import { workflowGrant,alertFilters } from "../alert-reminder-validation";
export type AlertDatabase=Pick<Prisma.TransactionClient,"facultyIssue"|"observation"|"evaluationCycle"|"role"|"appUser"|"notification">;
export const alertInclude={reporter:{select:{userId:true,fullName:true}},observation:{include:{signup:{include:{professor:{include:{user:{select:{userId:true,fullName:true}}}},section:{include:{course:true,semester:true}}}},observer:{include:{user:{select:{userId:true,fullName:true}}}},currentReleasedList:{select:{publishedAt:true}},candidates:{include:{professor:{include:{user:{select:{userId:true,fullName:true}}}}}}}}} as const;
export type AlertRow=Prisma.FacultyIssueGetPayload<{include:typeof alertInclude}>;
export function alertResource(a:AlertRow,user:ConfigurationUser){
 const o=a.observation,s=o.signup.section;
 return {id:a.issueId,observationId:a.observationId,cycleId:o.cycleId,type:"ALERT",reasonCode:"OTHER",reason:a.reason,details:a.details,
  createdAt:a.createdAt.toISOString(),
  createdBy:{id:a.reporter.userId,name:a.reporter.fullName},
  context:{observee:{id:o.signup.professor.userId,name:o.signup.professor.user.fullName},observer:o.observer?{id:o.observer.userId,name:o.observer.user.fullName}:null,
   section:{id:s.sectionId,course:s.course.courseCode,sectionNumber:s.sectionCode,semester:{id:s.semesterId,name:s.semester.termName}},observationStatus:o.status,
   candidates:o.candidates.filter(c=>c.recommendationListId===(user.permissions.includes("observations.read")?o.currentDraftListId??o.currentReleasedListId:o.currentReleasedListId) && (user.permissions.includes("observations.read")||!!o.currentReleasedList?.publishedAt)).map(c=>({id:c.candidateId,name:c.professor.user.fullName,status:c.status}))},
  allowedActions:[]};
}
export async function getAlert(db:AlertDatabase,user:ConfigurationUser,id:string){
 const broad=user.permissions.includes("observations.read");
 if(!broad)workflowGrant(user,"observations.read.own");
 const a=await db.facultyIssue.findFirst({where:{issueId:uuid(id),kind:"ALERT",...(broad?{}:{reportedBy:user.id,observation:{signup:{professor:{userId:user.id}}}})},include:alertInclude});
 if(!a)throw new ConfigurationError(404,"NOT_FOUND","Alert not found.");return alertResource(a,user);
}
export async function getCycleAlerts(db:AlertDatabase,user:ConfigurationUser,cycleId:string,url:URL){
 workflowGrant(user,"observations.read");uuid(cycleId);const f=alertFilters(url),{limit,cursor}=pagination(url);
 if(!await db.evaluationCycle.findUnique({where:{cycleId},select:{cycleId:true}}))throw new ConfigurationError(404,"NOT_FOUND","Evaluation cycle not found.");
 const where:Prisma.FacultyIssueWhereInput={kind:"ALERT",observation:{cycleId,...(f.departmentId?{signup:{professor:{departmentId:f.departmentId}}}:{})}};
 if(cursor&&!await db.facultyIssue.findFirst({where:{AND:[where,{issueId:cursor}]},select:{issueId:true}}))throw new ConfigurationError(400,"INVALID_CURSOR","Invalid alert cursor.");
 const rows=await db.facultyIssue.findMany({where:{AND:[where,...(cursor?[{issueId:{gt:cursor}}]:[])]},include:alertInclude,orderBy:{issueId:"asc"},take:limit+1});
 const items=rows.slice(0,limit).map(a=>alertResource(a,user)),hasMore=rows.length>limit;
 return {items,pageInfo:{hasMore,nextCursor:hasMore?items.at(-1)!.id:null}};
}
