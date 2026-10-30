import type { AlertResource, AttentionItem } from "./ac-api";

export type DashboardAttentionItem = AttentionItem & { rowKey: string };

// The current attention API returns non-message issues. Retain compatibility with
// its draft alertId field if it also supplies messages later. Observation IDs and
// faculty names never identify a message: one observation can have many messages.
export function mergeAttention(attention: AttentionItem[], alerts: AlertResource[]): DashboardAttentionItem[] {
  const rows = new Map<string, DashboardAttentionItem>();
  for (const item of attention) {
    const alertId = item.issue === "alert" ? item.alertId || item.id : undefined;
    const rowKey = alertId ? `alert:${alertId}` : `${item.issue}:${item.id}`;
    rows.set(rowKey, { ...item, alertId, rowKey });
  }
  for (const alert of alerts) {
    const rowKey = `alert:${alert.id}`;
    rows.set(rowKey, {
      id: alert.id, alertId: alert.id, rowKey, issue: "alert",
      faculty: { id: alert.createdBy?.id ?? "", name: alert.context.observee.name },
      observationId: alert.observationId, observationStatus: alert.context.observationStatus,
    });
  }
  return [...rows.values()];
}

export function attentionReviewHref(item: AttentionItem) {
  if (!item.observationId) return null;
  const path = `/ac/observations/${encodeURIComponent(item.observationId)}`;
  return item.issue === "alert"
    ? `${path}?alertId=${encodeURIComponent(item.alertId || item.id)}`
    : path;
}
