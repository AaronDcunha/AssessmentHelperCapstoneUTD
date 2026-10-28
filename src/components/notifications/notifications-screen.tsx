"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { createNotificationsController } from "@/lib/notifications-state";
import { notificationDestination, type ReadFilter } from "@/lib/notifications-api";
import styles from "./notifications.module.css";

export function NotificationsScreen({ permissions }: { permissions: readonly string[] }) {
  const [store] = useState(() => createNotificationsController());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); return store.dispose; }, [store]);
  const canUpdate = permissions.includes("notifications.update.own");
  const busy = state.pending !== null;
  const updatesDisabled = busy || state.writeBlocked || state.state !== "ready" || state.loadingMore;
  return <div className="space-y-ah-24">
    <Select name="read" label="All / Unread" value={state.filter} wrapperClassName="max-w-[480px]" className={`min-h-control-56 ${styles.filter}`}
      disabled={busy} onChange={event => { void store.load(event.target.value as ReadFilter); }}>
      <option value="all">All</option><option value="unread">Unread</option>
    </Select>
    <div className="flex flex-wrap items-center gap-ah-16">
      {canUpdate && <Button className="w-full sm:w-[260px]" disabled={updatesDisabled || state.unreadCount === 0}
        aria-busy={state.pending === "all"} onClick={() => { void store.markAllRead(); }}>
        {state.pending === "all" ? "Marking all read…" : "Mark All Read"}
      </Button>}
      <TextAction disabled={busy} onClick={() => { void store.load(); }}>Refresh</TextAction>
    </div>
    {state.notice && <p role="status" className="text-body text-sidebar">{state.notice}</p>}
    {state.error && <div className="space-y-ah-8 rounded-ah-8 border border-border bg-surface p-ah-16">
      <p role="alert" className="text-body text-danger">{state.error}</p>
      {state.writeBlocked && state.state === "ready" && <p className="text-body text-muted">Refresh notifications to confirm their current state before making another change.</p>}
      {state.state === "signedOut" && <Link className="text-label text-sidebar underline" href="/login">Sign in</Link>}
      {state.state !== "denied" && state.state !== "signedOut" && <TextAction disabled={busy} onClick={() => { void store.load(); }}>Try again</TextAction>}
    </div>}
    <section aria-labelledby="notifications-heading" className="space-y-ah-16">
      <h2 id="notifications-heading" className="text-section">Recent notifications</h2>
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface" tabIndex={0} role="region" aria-label="Recent notifications" aria-busy={state.state === "loading" || state.loadingMore}>
        <table className={styles.table}>
          <caption className="sr-only">Your notifications, details and available actions</caption>
          <colgroup><col className="w-[27.4%]" /><col className="w-[56.2%]" /><col className="w-[16.4%]" /></colgroup>
          <thead><tr>{["Notification", "Details", "Action"].map(label => <TableCell key={label} variant="header">{label}</TableCell>)}</tr></thead>
          <tbody>
            {state.state === "loading" ? <tr><td colSpan={3} className="p-ah-32 text-center text-body text-muted" role="status">Loading notifications…</td></tr>
              : state.items.length === 0 ? <tr><td colSpan={3} className="p-ah-32 text-center text-body text-muted" role="status">
                {state.state === "ready" ? state.filter === "unread" ? "You're all caught up. No unread notifications." : "No notifications yet."
                  : state.state === "denied" ? "Notification access is denied." : state.state === "signedOut" ? "Sign in to view notifications." : "Notifications are currently unavailable."}
              </td></tr> : state.items.map(item => {
                const href = notificationDestination(item.target, permissions);
                return <tr key={item.id}>
                  <TableCell>
                    <div className="flex items-start gap-ah-8">
                      {item.readAt === null && <span className="mt-ah-8 size-2 shrink-0 rounded-ah-pill bg-accent" aria-label="Unread" role="img" />}
                      <div className="min-w-0 space-y-ah-4">
                        <p className={item.readAt === null ? "font-semibold" : undefined}>{item.title}</p>
                        <time className="block text-caption text-muted" dateTime={item.createdAt}>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time>
                        {canUpdate && <TextAction className={styles.readAction} disabled={updatesDisabled} aria-busy={state.pending === item.id}
                          aria-label={`${item.readAt === null ? "Mark as read" : "Mark as unread"}: ${item.title}`}
                          onClick={() => { void store.setRead(item.id, item.readAt === null); }}>
                          {state.pending === item.id ? "Saving…" : item.readAt === null ? "Mark as read" : "Mark as unread"}
                        </TextAction>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><p className="whitespace-pre-wrap">{item.message}</p></TableCell>
                  <TableCell>{href ? <TextAction href={href} aria-label={`View: ${item.title}`}>View</TextAction>
                    : <span className="text-caption text-muted">No available destination</span>}</TableCell>
                </tr>;
              })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-ah-16">
        <p role="status" className="text-caption text-muted">{state.state === "ready" ? `${state.items.length} shown · ${state.unreadCount === null ? "Unread count unavailable" : `${state.unreadCount} unread`}` : ""}</p>
        {state.nextCursor && <Button variant="secondary" disabled={busy || state.loadingMore} aria-busy={state.loadingMore} onClick={() => { void store.loadMore(); }}>{state.loadingMore ? "Loading…" : "Load more"}</Button>}
      </div>
    </section>
  </div>;
}
