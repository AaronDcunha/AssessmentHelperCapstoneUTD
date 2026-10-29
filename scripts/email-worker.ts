import cron from "node-cron";
import {getPrisma} from "../src/server/prisma";
import {createEmailTransport,defaultMailFrom} from "../src/server/email/transport";
import {deliverNotificationEmails} from "../src/server/jobs/email-delivery";

if(process.env.EMAIL_DELIVERY_ENABLED!=="true")throw new Error("Set EMAIL_DELIVERY_ENABLED=true to start the email worker.");
const transport=createEmailTransport(),db=getPrisma();
let running=false;
async function run(){
  if(running)return;
  running=true;
  try{
    const result=await deliverNotificationEmails(db,async message=>{
      const info=await transport.sendMail(message);
      if(info.rejected.length)throw Object.assign(new Error("Recipient rejected."),{code:"RECIPIENT_REJECTED",responseCode:550});
    },{from:process.env.MAIL_FROM??defaultMailFrom});
    console.log("Email delivery batch:",result);
  }finally{running=false;}
}
if(process.argv.includes("--once")){
  try{await run();}finally{transport.close();await db.$disconnect();}
}else{
  const safeRun=()=>run().catch(()=>console.error("Email delivery job failed. Check database/SMTP configuration; pending work remains queued."));
  cron.schedule("* * * * *",safeRun);
  await safeRun();
  console.log("Email delivery worker is running every minute.");
}
