import Link from "next/link";
import { requireUser } from "@/server/permissions";

export default async function ForbiddenPage() {
  await requireUser();
  return <><h1>Access denied</h1><p>Your test account does not have permission for that page.</p><Link href="/auth-test">Back to auth tests</Link></>;
}
