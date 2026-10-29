"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { createNotificationsController } from "@/lib/notifications-state";
import { notificationDestination, type ReadFilter } from "@/lib/notifications-api";
import styles from "./notifications.module.css";

const notificationDate = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
export function NotificationsScreen({ permissions }: { permissions: readonly string[] }) {
  const [store] = useState(() => createNotificationsController());
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => { void store.load(); return store.dispose; }, [store]);
  const canUpdate = permissions.includes("notifications.update.own");
  const busy = state.pending !== null;
  const updatesDisabled = busy || state.writeBlocked || state.state !== "ready" || state.loadingMore;
  const selectedUnread = state.items.filter(item => state.selectedIds.includes(item.id) && item.readAt === null).length;
  const selectAll = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const dialogTitle = useId(), dialogMessage = useId();
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = state.selectedIds.length > 0 && state.selectedIds.length < state.items.length;
  }, [state.selectedIds, state.items.length]);
  useEffect(() => {
    if (state.opened && !dialog.current?.open) dialog.current?.showModal();
    if (!state.opened && dialog.current?.open) dialog.current.close();
  }, [state.opened]);
  const destination = state.opened ? notificationDestination(state.opened.target, permissions) : null;
  const columns = canUpdate ? 4 : 3;
  const errorPanel = state.error && <div className="space-y-ah-8 rounded-ah-8 border border-border bg-surface p-ah-16">
    <p role="alert" className="text-body text-danger">{state.error}</p>
    {state.writeBlocked && state.state === "ready" && <p className="text-body text-muted">Refresh notifications to confirm their current state before making another change.</p>}
    {state.state === "signedOut" && <Link className="text-label text-sidebar underline" href="/login">Sign in</Link>}
    {state.state !== "denied" && state.state !== "signedOut" && <TextAction disabled={busy} onClick={() => { void store.load(); }}>Refresh notifications</TextAction>}
  </div>;
  return <div className="space-y-ah-24">
    <Select name="read" label="All / Unread" value={state.filter} wrapperClassName="max-w-[480px]" className={`min-h-control-56 ${styles.filter}`}
      disabled={busy} onChange={event => { void store.load(event.target.value as ReadFilter); }}>
      <option value="all">All</option><option value="unread">Unread</option>
    </Select>
    <div className="flex flex-wrap items-center gap-ah-16">
      {canUpdate && <>
        <Button className="w-full sm:w-[260px]" disabled={updatesDisabled || state.unreadCount === 0}
          aria-busy={state.pending === "all"} onClick={() => { void store.markAllRead(); }}>
          {state.pending === "all" ? "Marking all read…" : "Mark All Read"}
        </Button>
        <Button variant="secondary" disabled={updatesDisabled || selectedUnread === 0} aria-busy={state.pending === "selected"}
          onClick={() => { void store.markSelectedRead(); }}>{state.pending === "selected" ? "Marking selected…" : "Mark selected as read"}</Button>
      </>}
      <TextAction disabled={busy} onClick={() => { void store.load(); }}>Refresh</TextAction>
    </div>
    {canUpdate && <p id="notification-selection-help" className="text-caption text-muted" role="status">
      {state.selectedIds.length} selected. Selection applies to loaded notifications.
    </p>}
    {state.notice && !state.opened && <p role="status" className="text-body text-sidebar">{state.notice}</p>}
    {!state.opened && errorPanel}
    <section aria-labelledby="notifications-heading" className="space-y-ah-16">
      <h2 ref={heading} tabIndex={-1} id="notifications-heading" className="text-section">Recent notifications</h2>
      <div className="overflow-x-auto rounded-ah-8 border border-border bg-surface" tabIndex={0} role="region" aria-label="Recent notifications" aria-busy={state.state === "loading" || state.loadingMore}>
        <table className={styles.table}>
          <caption className="sr-only">Your notifications, message previews and details</caption>
          <colgroup>{canUpdate && <col className="w-ah-48" />}<col className="w-[27.4%]" /><col className="w-[56.2%]" /><col className="w-[16.4%]" /></colgroup>
          <thead><tr>
            {canUpdate && <TableCell variant="header" className={styles.selectionCell}><input ref={selectAll} type="checkbox" className="size-4 accent-sidebar"
              aria-label="Select all loaded notifications" aria-describedby="notification-selection-help" disabled={updatesDisabled || state.items.length === 0}
              checked={state.items.length > 0 && state.selectedIds.length === state.items.length} onChange={event => store.selectLoaded(event.target.checked)} /></TableCell>}
            {["Notification", "Details", "Action"].map(label => <TableCell key={label} variant="header">{label}</TableCell>)}
          </tr></thead>
          <tbody>
            {state.state === "loading" ? <tr><td colSpan={columns} className="p-ah-32 text-center text-body text-muted" role="status">Loading notifications…</td></tr>
              : state.items.length === 0 ? <tr><td colSpan={columns} className="p-ah-32 text-center text-body text-muted" role="status">
                {state.state === "ready" ? state.filter === "unread" ? "You're all caught up. No unread notifications." : "No notifications yet."
                  : state.state === "denied" ? "Notification access is denied." : state.state === "signedOut" ? "Sign in to view notifications." : "Notifications are currently unavailable."}
              </td></tr> : state.items.map(item => <tr key={item.id} className={state.selectedIds.includes(item.id) ? styles.selectedRow : undefined}>
                {canUpdate && <TableCell className={styles.selectionCell}><input type="checkbox" className="size-4 accent-sidebar" aria-label={`Select: ${item.title}`}
                  disabled={updatesDisabled} checked={state.selectedIds.includes(item.id)} onChange={event => store.select(item.id, event.target.checked)} /></TableCell>}
                <TableCell>
                  <div className="flex items-start gap-ah-8">
                    {item.readAt === null && <span className="mt-ah-8 size-2 shrink-0 rounded-ah-pill bg-accent" aria-label="Unread" role="img" />}
                    <div className="min-w-0 space-y-ah-4">
                      <p className={item.readAt === null ? "font-semibold" : undefined}>{item.title}</p>
                      {item.sender && <p className="text-caption text-muted">From: {item.sender.name}</p>}
                      <time className="block text-caption text-muted" dateTime={item.createdAt}>{notificationDate(item.createdAt)}</time>
                      {canUpdate && <TextAction className={styles.readAction} disabled={updatesDisabled} aria-busy={state.pending === item.id}
                        aria-label={`${item.readAt === null ? "Mark as read" : "Mark as unread"}: ${item.title}`}
                        onClick={() => { void store.setRead(item.id, item.readAt === null); }}>
                        {state.pending === item.id ? "Saving…" : item.readAt === null ? "Mark as read" : "Mark as unread"}
                      </TextAction>}
                    </div>
                  </div>
                </TableCell>
                <TableCell><p className={styles.messagePreview}>{item.message}</p></TableCell>
                <TableCell><TextAction disabled={busy || state.loadingMore} aria-label={`View: ${item.title}`} onClick={() => {
                  opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
                  void store.open(item.id, canUpdate);
                }}>View</TextAction></TableCell>
              </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-ah-16">
        <p role="status" className="text-caption text-muted">{state.state === "ready" ? `${state.items.length} shown · ${state.unreadCount === null ? "Unread count unavailable" : `${state.unreadCount} unread`}` : ""}</p>
        {state.nextCursor && <Button variant="secondary" disabled={busy || state.loadingMore} aria-busy={state.loadingMore} onClick={() => { void store.loadMore(); }}>{state.loadingMore ? "Loading…" : "Load more"}</Button>}
      </div>
    </section>
    <dialog ref={dialog} aria-labelledby={dialogTitle} aria-describedby={dialogMessage}
      onClose={() => { store.close(); if (!opener.current?.isConnected) heading.current?.focus(); }}
      className={`${styles.detailDialog} m-auto max-h-[calc(100dvh-32px)] w-[min(760px,calc(100vw-32px))] overflow-hidden rounded-ah-12 border border-border bg-surface p-ah-24 text-ink backdrop:bg-ink/40 sm:p-ah-32`}>
      {state.opened && <div className="flex min-h-0 flex-1 flex-col gap-ah-24">
        <div className="shrink-0 space-y-ah-8">
          <h2 id={dialogTitle} className="break-words text-section">{state.opened.title}</h2>
          <p className="text-body text-muted">From: {state.opened.sender?.name ?? "Sender not recorded"}</p>
          <p className="text-caption text-muted"><time dateTime={state.opened.createdAt}>{notificationDate(state.opened.createdAt)}</time></p>
          <p role="status" className="text-caption text-muted">{state.pending === state.opened.id ? "Marking as read…" : state.opened.readAt === null ? "Unread" : "Read"}</p>
          {!canUpdate && <p className="text-caption text-muted">You do not have permission to change the read status.</p>}
        </div>
        <p id={dialogMessage} tabIndex={0} className="min-h-0 overflow-y-auto whitespace-pre-wrap break-words text-body">{state.opened.message}</p>
        {errorPanel}
        <div className="flex shrink-0 flex-wrap justify-end gap-ah-12">
          {destination && <ButtonLink href={destination} variant="secondary">View observation details</ButtonLink>}
          <Button autoFocus onClick={() => dialog.current?.close()}>Close</Button>
        </div>
      </div>}
    </dialog>
  </div>;
}
