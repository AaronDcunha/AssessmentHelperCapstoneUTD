"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BellIcon } from "@/components/ui/icons";
import { notificationsApi } from "@/lib/notifications-api";

export function NotificationBell() {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    let controller: AbortController | null = null;
    async function refresh() {
      controller?.abort();
      const request = new AbortController(); controller = request;
      try { const result = await notificationsApi.unreadCount(request.signal); if (!request.signal.aborted) setCount(result.unreadCount); }
      catch { if (!request.signal.aborted) setCount(null); }
    }
    void refresh();
    const onFocus = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("notifications:changed", refresh);
    window.addEventListener("focus", onFocus);
    return () => { controller?.abort(); window.removeEventListener("notifications:changed", refresh); window.removeEventListener("focus", onFocus); };
  }, []);
  return <Link href="/notifications" className="relative inline-flex size-ah-24 shrink-0 items-center justify-center rounded-ah-8 text-ink hover:bg-neutral-bg"
    aria-label={count === null ? "Notifications (unread count unavailable)" : `Notifications (${count} unread)`}>
    <BellIcon />
    {count !== null && count > 0 && <span aria-hidden="true" className="absolute -right-2 -top-2 flex min-h-4 min-w-4 items-center justify-center rounded-ah-pill bg-accent px-1 text-caption text-ink">{count > 99 ? "99+" : count}</span>}
  </Link>;
}
