import { getCurrentUser } from "@/server/permissions";

export async function GET() {
  const user = await getCurrentUser();
  return Response.json(user ?? { error: "Unauthenticated" }, {
    status: user ? 200 : 401,
    headers: { "Cache-Control": "no-store" },
  });
}
