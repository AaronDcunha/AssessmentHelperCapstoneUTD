import { isTestArea } from "@/server/demo-auth";
import { checkApiPermission } from "@/server/permissions";

export async function GET(_request: Request, context: { params: Promise<{ area: string }> }) {
  const { area } = await context.params;
  if (!isTestArea(area)) return Response.json({ error: "Not found" }, { status: 404 });
  const result = await checkApiPermission(`test:${area}`);
  if (result instanceof Response) return result;
  return Response.json({ message: `Hi, this is the ${area} API.`, username: result.username }, {
    headers: { "Cache-Control": "no-store" },
  });
}
