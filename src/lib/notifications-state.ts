import { notificationsApi, NotificationRequestError, notifyNotificationChange, type NotificationItem, type ReadFilter } from "./notifications-api";

type Snapshot = {
  filter: ReadFilter; state: "loading" | "ready" | "error" | "denied" | "signedOut";
  items: NotificationItem[]; unreadCount: number | null; nextCursor: string | null;
  loadingMore: boolean; pending: string | null; error: string | null; notice: string | null; writeBlocked: boolean;
};
const initial: Snapshot = { filter: "all", state: "loading", items: [], unreadCount: null, nextCursor: null,
  loadingMore: false, pending: null, error: null, notice: null, writeBlocked: false };

export function createNotificationsController(api = notificationsApi) {
  let snapshot = initial, generation = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>(), cursors = new Set<string>();
  const update = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  function errorState(error: unknown) {
    const status = error instanceof NotificationRequestError ? error.status : undefined;
    const errorMessage = error instanceof Error ? error.message : "Notifications are currently unavailable.";
    if (status === 401 || status === 403) {
      update({ state: status === 401 ? "signedOut" : "denied", items: [], unreadCount: null, nextCursor: null, writeBlocked: true, error: errorMessage });
      notifyNotificationChange();
    } else update({ error: errorMessage });
  }
  async function load(filter = snapshot.filter, more = false) {
    if (snapshot.pending || more && (snapshot.loadingMore || !snapshot.nextCursor)) return;
    controller?.abort(); controller = new AbortController();
    const active = ++generation, signal = controller.signal, cursor = more ? snapshot.nextCursor! : undefined;
    if (more) update({ loadingMore: true, error: null, notice: null });
    else { cursors.clear(); update({ ...initial, filter }); }
    try {
      const page = await api.list(filter, cursor, signal);
      if (signal.aborted || active !== generation) return;
      if (page.pageInfo.nextCursor && (page.pageInfo.nextCursor === cursor || cursors.has(page.pageInfo.nextCursor))) throw new Error("Notification pagination could not be continued. Refresh notifications.");
      if (page.pageInfo.nextCursor) cursors.add(page.pageInfo.nextCursor);
      const combined = more ? [...snapshot.items] : [];
      for (const item of page.items) { const index = combined.findIndex(existing => existing.id === item.id); if (index < 0) combined.push(item); else combined[index] = item; }
      update({ state: "ready", items: combined, unreadCount: page.unreadCount, nextCursor: page.pageInfo.nextCursor, loadingMore: false, writeBlocked: false });
    } catch (error) {
      if (signal.aborted || active !== generation) return;
      if (!more) update({ state: "error" });
      errorState(error);
      update({ loadingMore: false });
    }
  }
  async function mutate(id: string | null, read = true) {
    if (snapshot.pending || snapshot.loadingMore || snapshot.state !== "ready" || snapshot.writeBlocked) return;
    const current = id === null ? null : snapshot.items.find(item => item.id === id);
    if (id !== null && !current) return;
    update({ pending: id ?? "all", error: null, notice: null });
    try {
      if (id !== null) {
        const item = await api.setRead(id, read);
        update({ items: snapshot.items.flatMap(old => old.id !== id ? [old] : snapshot.filter === "unread" && item.readAt !== null ? [] : [item]),
          notice: read ? "Notification marked as read." : "Notification marked as unread." });
        notifyNotificationChange();
        try { const count = await api.unreadCount(); update({ unreadCount: count.unreadCount }); }
        catch (error) { update({ unreadCount: null }); errorState(error); }
      } else {
        const result = await api.markAllRead();
        update({ items: snapshot.items.flatMap(item => {
          // The server cutoff protects notifications that arrived after mark-all started.
          if (item.readAt !== null || Date.parse(item.createdAt) > Date.parse(result.cutoff)) return [item];
          return snapshot.filter === "unread" ? [] : [{ ...item, readAt: result.cutoff }];
        }), unreadCount: result.unreadCount, notice: `${result.updatedCount} ${result.updatedCount === 1 ? "notification" : "notifications"} marked as read.` });
        notifyNotificationChange();
      }
    } catch (error) {
      if (error instanceof NotificationRequestError && error.uncertain) {
        update({ writeBlocked: true, unreadCount: null }); notifyNotificationChange();
      }
      errorState(error);
    } finally { update({ pending: null }); }
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    load, loadMore: () => load(snapshot.filter, true), setRead: (id: string, read: boolean) => mutate(id, read), markAllRead: () => mutate(null),
    dispose: () => { controller?.abort(); generation++; },
  };
}
