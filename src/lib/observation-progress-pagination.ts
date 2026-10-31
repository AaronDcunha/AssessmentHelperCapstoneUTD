import type { ObservationItem, Page } from "./ac-api";

export type ObservationPagePosition = { cycleIndex: number; cursor?: string };
export type ObservationProgressPage = { items: ObservationItem[]; next: ObservationPagePosition | null };

/** Read only enough cycle pages to fill the visible page, plus a lookahead row. */
export async function loadObservationProgressPage(
  cycleIds: readonly string[], position: ObservationPagePosition, limit: number,
  fetchPage: (cycleId: string, cursor: string | undefined, limit: number) => Promise<Page<ObservationItem>>,
): Promise<ObservationProgressPage> {
  const items: ObservationItem[] = [];
  let { cycleIndex, cursor } = position;
  const seen = new Set<string>();
  while (cycleIndex < cycleIds.length) {
    const key = `${cycleIndex}:${cursor ?? ""}`;
    if (seen.has(key)) throw new Error("Observation pagination did not advance.");
    seen.add(key);
    const remaining = limit - items.length;
    const page = await fetchPage(cycleIds[cycleIndex], cursor, Math.min(100, remaining + 1));
    if (!Array.isArray(page?.items) || typeof page.pageInfo?.hasMore !== "boolean") throw new Error("Invalid observation page.");
    const consumed = page.items.slice(0, remaining);
    items.push(...consumed);
    if (page.items.length > remaining) return { items, next: { cycleIndex, cursor: consumed.at(-1)?.id ?? cursor } };
    if (page.pageInfo.hasMore) {
      if (!page.pageInfo.nextCursor || page.pageInfo.nextCursor === cursor) throw new Error("Observation pagination did not advance.");
      cursor = page.pageInfo.nextCursor;
      if (items.length === limit) return { items, next: { cycleIndex, cursor } };
    } else {
      cycleIndex++;
      cursor = undefined;
    }
  }
  return { items, next: null };
}
