import "server-only";
import nodemailer from "smtp-mailer";

export const defaultMailFrom="Assessment Helper <noreply_course_evaluation@assessmenthelper.edu>";
export function createEmailTransport(env:NodeJS.ProcessEnv=process.env){
  const host=env.SMTP_HOST?.trim();
  const port=Number(env.SMTP_PORT??1025);
  if(!host || !Number.isInteger(port)||port<1||port>65535)throw new Error("Configure SMTP_HOST and a valid SMTP_PORT before starting email delivery.");
  if(env.SMTP_SECURE!==undefined && !["true","false"].includes(env.SMTP_SECURE))throw new Error("SMTP_SECURE must be true or false.");
  if(Boolean(env.SMTP_USER)!==Boolean(env.SMTP_PASSWORD))throw new Error("Configure both SMTP_USER and SMTP_PASSWORD, or neither.");
  return nodemailer.createTransport({host,port,secure:env.SMTP_SECURE==="true",
    ...(env.SMTP_USER?{auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}}:{}),
    connectionTimeout:10000,greetingTimeout:10000,socketTimeout:30000,
    disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
}
export function emailMessage(input:{id:string;to:string;title:string;message:string},from=defaultMailFrom){
  if(/[\r\n]/.test(from)||!from.trim())throw new Error("Invalid MAIL_FROM.");
  const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
  return {from,to:{address:input.to,name:""},subject:input.title.replace(/[\r\n]+/g," "),
    messageId:`<notification-${input.id}@assessmenthelper.edu>`,
    text:`${input.title}\n\n${input.message}\n\nAssessment Helper\nThis is an automated notification. Please do not reply.`,
    html:`<!doctype html><html><body><h1>${escape(input.title)}</h1><div style="white-space:pre-wrap">${escape(input.message)}</div><hr><p>Assessment Helper<br>This is an automated notification. Please do not reply.</p></body></html>`};
}
