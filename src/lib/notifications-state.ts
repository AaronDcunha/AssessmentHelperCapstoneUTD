import { notificationsApi, NotificationRequestError, notifyNotificationChange, type NotificationItem, type ReadFilter } from "./notifications-api";

type Snapshot = {
  selectedIds: string[]; opened: NotificationItem | null;
  filter: ReadFilter; state: "loading" | "ready" | "error" | "denied" | "signedOut";
  items: NotificationItem[]; unreadCount: number | null; nextCursor: string | null;
  page: number; pageSize: number;
  pending: string | null; error: string | null; notice: string | null; writeBlocked: boolean;
};
const initial: Snapshot = { selectedIds: [], opened: null, filter: "all", state: "loading", items: [], unreadCount: null, nextCursor: null,
  page: 1, pageSize: 10, pending: null, error: null, notice: null, writeBlocked: false };

export function createNotificationsController(api = notificationsApi) {
  let snapshot = initial, generation = 0;
  let controller: AbortController | null = null;
  const listeners = new Set<() => void>();
  let cursors: (string | undefined)[] = [undefined];
  const update = (patch: Partial<Snapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach(listener => listener()); };
  function errorState(error: unknown) {
    const status = error instanceof NotificationRequestError ? error.status : undefined;
    const errorMessage = error instanceof Error ? error.message : "Notifications are currently unavailable.";
    if (status === 401 || status === 403) {
      update({ state: status === 401 ? "signedOut" : "denied", items: [], selectedIds: [], opened: null, unreadCount: null, nextCursor: null, writeBlocked: true, error: errorMessage });
      notifyNotificationChange();
    } else update({ error: errorMessage });
  }
  async function fetchPage(filter: ReadFilter, pageSize: number, pageNumber: number, preserveDetail = false) {
    controller?.abort(); controller = new AbortController();
    const active = ++generation, signal = controller.signal, cursor = cursors[pageNumber - 1];
    const { opened, notice } = snapshot;
    update({ ...initial, filter, pageSize, page: pageNumber,
      opened: preserveDetail ? opened : null, notice: preserveDetail ? notice : null });
    try {
      const page = await api.list(filter, cursor, signal, pageSize);
      if (signal.aborted || active !== generation) return;
      if (page.pageInfo.nextCursor && cursors.slice(0, pageNumber).includes(page.pageInfo.nextCursor)) {
        throw new Error("Notification pagination could not be continued. Refresh notifications.");
      }
      if (!page.items.length && pageNumber > 1) {
        return fetchPage(filter, pageSize, pageNumber - 1, preserveDetail);
      }
      cursors.length = pageNumber;
      update({ state: "ready", items: page.items, unreadCount: page.unreadCount, nextCursor: page.pageInfo.nextCursor });
    } catch (error) {
      if (signal.aborted || active !== generation) return;
      update({ state: "error" });
      errorState(error);
    }
  }
  function load(filter = snapshot.filter, pageSize = snapshot.pageSize) {
    if (snapshot.pending) return;
    cursors = [undefined];
    return fetchPage(filter, pageSize, 1);
  }
  function movePage(direction: -1 | 1) {
    if (snapshot.pending || snapshot.state !== "ready") return;
    const { page, filter, pageSize, nextCursor } = snapshot;
    if (direction === -1 && page === 1 || direction === 1 && !nextCursor) return;
    if (direction === 1) cursors[page] = nextCursor!;
    return fetchPage(filter, pageSize, page + direction);
  }
  function refillPage() {
    if (snapshot.state === "ready" && !snapshot.writeBlocked && (snapshot.nextCursor || snapshot.page > 1)) {
      return fetchPage(snapshot.filter, snapshot.pageSize, snapshot.page, true);
    }
  }
  async function mutate(id: string | null, read = true) {
    if (snapshot.pending || snapshot.state !== "ready" || snapshot.writeBlocked) return;
    const current = id === null ? null : snapshot.items.find(item => item.id === id);
    if (id !== null && !current) return;
    update({ pending: id ?? "all", error: null, notice: null });
    try {
      if (id !== null) {
        const item = await api.setRead(id, read);
        applyItem(item);
        update({ notice: read ? "Notification marked as read." : "Notification marked as unread." });
        notifyNotificationChange();
        try { const count = await api.unreadCount(); update({ unreadCount: count.unreadCount }); }
        catch (error) { update({ unreadCount: null }); errorState(error); }
      } else {
        const result = await api.markAllRead();
        update({ items: snapshot.items.flatMap(item => {
          // The server cutoff protects notifications that arrived after mark-all started.
          if (item.readAt !== null || Date.parse(item.createdAt) > Date.parse(result.cutoff)) return [item];
          return snapshot.filter === "unread" ? [] : [{ ...item, readAt: result.cutoff }];
        }), selectedIds: [], opened: snapshot.opened && snapshot.opened.readAt === null && Date.parse(snapshot.opened.createdAt) <= Date.parse(result.cutoff) ? { ...snapshot.opened, readAt: result.cutoff } : snapshot.opened, unreadCount: result.unreadCount, notice: `${result.updatedCount} ${result.updatedCount === 1 ? "notification" : "notifications"} marked as read.` });
        notifyNotificationChange();
      }
    } catch (error) {
      if (error instanceof NotificationRequestError && error.uncertain) {
        update({ writeBlocked: true, unreadCount: null }); notifyNotificationChange();
      }
      errorState(error);
    } finally { update({ pending: null }); }
    if (snapshot.filter === "unread" && read && snapshot.notice) {
      if (id === null && snapshot.page > 1 && !snapshot.writeBlocked) {
        cursors = [undefined];
        await fetchPage(snapshot.filter, snapshot.pageSize, 1, true);
      } else await refillPage();
    }
  }
  function applyItem(item: NotificationItem) {
    update({ items: snapshot.items.flatMap(old => old.id !== item.id ? [old] : snapshot.filter === "unread" && item.readAt !== null ? [] : [item]),
      selectedIds: snapshot.selectedIds.filter(id => id !== item.id), opened: snapshot.opened?.id === item.id ? item : snapshot.opened });
  }
  async function markSelectedRead() {
    if (snapshot.pending || snapshot.state !== "ready" || snapshot.writeBlocked) return;
    const items = snapshot.items.filter(item => snapshot.selectedIds.includes(item.id) && item.readAt === null);
    if (!items.length) return;
    update({ pending: "selected", error: null, notice: null,
      selectedIds: snapshot.selectedIds.filter(id => snapshot.items.some(item => item.id === id && item.readAt === null)) });
    let changed = 0;
    try {
      for (const item of items) {
        const updated = await api.setRead(item.id, true);
        applyItem(updated); changed++;
      }
    } catch (error) {
      if (error instanceof NotificationRequestError && error.uncertain) update({ writeBlocked: true, unreadCount: null });
      errorState(error);
    } finally {
      if (changed) update({ notice: `${changed} ${changed === 1 ? "notification" : "notifications"} marked as read.` });
      if (snapshot.state === "ready") {
        try { const count = await api.unreadCount(); update({ unreadCount: count.unreadCount }); }
        catch (error) { update({ unreadCount: null }); errorState(error); }
      }
      notifyNotificationChange(); update({ pending: null });
    }
    if (changed && snapshot.filter === "unread" && !snapshot.error) await refillPage();
  }
  async function remove(ids: string[]) {
    if (snapshot.pending || snapshot.state !== "ready" || snapshot.writeBlocked) return;
    const selected = [...new Set(ids)].filter(id => snapshot.items.some(item => item.id === id));
    if (!selected.length || selected.length > 100) return;
    update({pending:"delete",error:null,notice:null});
    try {
      const result = await api.delete(selected);
      update({items:snapshot.items.filter(item => !selected.includes(item.id)),
        selectedIds:snapshot.selectedIds.filter(id => !selected.includes(id)),
        opened:snapshot.opened && selected.includes(snapshot.opened.id) ? null : snapshot.opened,
        unreadCount:result.unreadCount,notice:`${result.deletedCount} ${result.deletedCount === 1 ? "notification" : "notifications"} deleted.`});
      notifyNotificationChange();
    } catch (error) {
      if (error instanceof NotificationRequestError && error.uncertain) {
        update({writeBlocked:true,unreadCount:null}); notifyNotificationChange();
      }
      errorState(error);
    } finally { update({pending:null}); }
    if (snapshot.notice) await refillPage();
  }
  return {
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    load, movePage,
    retry: () => fetchPage(snapshot.filter, snapshot.pageSize, snapshot.page, true),
    setRead: (id: string, read: boolean) => mutate(id, read), markAllRead: () => mutate(null),
    markSelectedRead, remove, deleteSelected: () => remove(snapshot.selectedIds),
    select: (id: string, checked: boolean) => {
      if (snapshot.pending || !snapshot.items.some(item => item.id === id)) return;
      update({ selectedIds: checked ? [...new Set([...snapshot.selectedIds, id])].slice(0,100) : snapshot.selectedIds.filter(value => value !== id) });
    },
    selectLoaded: (checked: boolean) => { if (!snapshot.pending) update({ selectedIds: checked ? snapshot.items.slice(0,100).map(item => item.id) : [] }); },
    open: async (id: string, markRead: boolean) => {
      const item = snapshot.items.find(item => item.id === id);
      if (!item || snapshot.pending) return;
      update({ opened: item });
      if (markRead && item.readAt === null) await mutate(id, true);
    },
    close: () => update({ opened: null }),
    dispose: () => { controller?.abort(); generation++; },
  };
}
