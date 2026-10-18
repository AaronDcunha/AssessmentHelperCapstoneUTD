import Link from "next/link";
import { signOut } from "@/auth";
import { requirePermission } from "@/server/permissions";
import { testAreas } from "@/server/demo-auth";

export default async function AuthTestPage() {
  const user = await requirePermission("test:admin");
  return (
    <div>
      <h1>Authentication backend test</h1>
      <p>Signed in as {user.username}. Roles: {user.roles.join(", ")}.</p>
      <p>Permissions: {user.permissions.join(", ")}.</p>
      <ul>{testAreas.map((area) => <li key={area}><Link href={`/test/${area}`}>{area} test page</Link></li>)}</ul>
      <p><a href="/api/me">Current user JSON</a></p>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/login" }); }}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  );
}
