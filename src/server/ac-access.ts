import { redirect } from "next/navigation";
import { requireUser } from "./permissions";
import { canAccessAcPage, type AcPage } from "../lib/ac-permissions";

export async function requireAcPage(page: AcPage) {
  const user = await requireUser();
  if (!canAccessAcPage(user.permissions, page)) redirect("/forbidden");
  return user;
}
