import { notFound } from "next/navigation";
import { signOut } from "@/auth";
import { isTestArea } from "@/server/demo-auth";
import { requirePermission } from "@/server/permissions";

export default async function AreaTestPage({ params }: { params: Promise<{ area: string }> }) {
  const { area } = await params;
  if (!isTestArea(area)) notFound();
  await requirePermission(`test:${area}`);
  return (
    <>
      <p>Hi, I&apos;m {area}.</p>
      <form action={async () => {
        "use server";
        await signOut({ redirectTo: "/api/auth/signin" });
      }}>
        <button type="submit">Log out</button>
      </form>
    </>
  );
}
