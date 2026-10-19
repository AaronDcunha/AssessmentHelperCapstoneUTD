import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/server/permissions";

export default async function ForbiddenPage() {
  await requireUser();
  return (
    <>
      <h1>Access denied</h1>
      <p>Your account does not have permission for that page. Test pages require Admin access.</p>
      <form action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}>
        <Button type="submit">Sign out</Button>
      </form>
    </>
  );
}
