// Run explicitly with npm run jobs:faculty. Does not start alongside Next.js.
import cron from "node-cron";
import { processFacultyInvitationExpiry } from "../src/server/services/faculty-invitations";
let running = false;
cron.schedule("*/5 * * * *", async () => {
  if (running) return;
  running = true;
  try { await processFacultyInvitationExpiry(); }
  catch { console.error("Faculty invitation expiry job failed; it will be checked on the next scheduled run."); }
  finally { running = false; }
});
console.log("Faculty invitation expiry scheduler is running every five minutes.");
