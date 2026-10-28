// Explicit separate worker, no application-start side effects.
// node --import ./scripts/server-loader.mjs --env-file-if-exists=.env scripts/faculty-invitations.ts
import { processFacultyInvitationExpiry } from "../src/server/services/faculty-invitations";
import { getPrisma } from "../src/server/prisma";
try { await processFacultyInvitationExpiry(); }
finally { await getPrisma().$disconnect(); }
