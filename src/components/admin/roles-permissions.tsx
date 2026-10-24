"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";
import { createRolesController, initialRolesState, samePermissionKeys, type RolesState } from "./roles-state";

export function RolesPermissions({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<RolesState>(initialRolesState);
  const [controller] = useState(() => createRolesController(setState));
  useEffect(() => { void controller.load(); return () => controller.cancel(); }, [controller]);
  useEffect(() => {
    const dirty = state.roles.some(role => !samePermissionKeys(role.permissionKeys, state.drafts[role.id]));
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.roles, state.drafts]);

  if (state.status === "loading") return <p role="status" className="text-muted">Loading roles and permissions…</p>;
  if (state.status === "error") return <div className="space-y-ah-16">
    <p role="alert" className="text-danger">{state.error?.message}</p>
    {state.error?.status === 401 ? <ButtonLink href="/login" variant="secondary">Sign in</ButtonLink>
      : <Button variant="secondary" onClick={() => void controller.load()}>Retry roles and permissions</Button>}
  </div>;
  if (!state.roles.length) return <div className="space-y-ah-16">
    <p role="status" className="text-muted">No roles are available.</p>
    <Button variant="secondary" onClick={() => void controller.load()}>Reload roles and permissions</Button>
  </div>;

  const known = new Set(state.permissions.map(item => item.key));
  const unknown = [...new Set(state.roles.flatMap(role => role.permissionKeys).filter(key => !known.has(key)))];
  const rows = [...state.permissions, ...unknown.map(key => ({ key, name: key }))];
  const width = 430 + 222 * state.roles.length;
  const disabled = !!state.busyId || state.authDenied;
  const dirtyCount = state.roles.filter(role => !samePermissionKeys(role.permissionKeys, state.drafts[role.id])).length;
  const needsSignIn = Object.values(state.feedback).some(item => item?.error?.status === 401);

  return <div className="space-y-ah-24">
    <Section title="Role permission assignments" variant="plain" className="[&>div:first-child]:sr-only">
      <div className="overflow-hidden rounded-ah-8 border border-border" aria-busy={!!state.busyId}>
        <div className="overflow-x-auto" role="region" aria-label="Role permission matrix" tabIndex={0}>
          <table className="w-full table-fixed [&_td]:h-[80px] [&_td]:w-auto! [&_th]:h-[80px] [&_th]:w-auto!"
            style={{ minWidth: 430 + 160 * state.roles.length }}>
            <caption className="sr-only">Direct permission assignments by role. Inherited access is separate.</caption>
            <colgroup><col style={{ width: `${430 / width * 100}%` }} />
              {state.roles.map(role => <col key={role.id} style={{ width: `${222 / width * 100}%` }} />)}
            </colgroup>
            <thead><tr><TableCell variant="header">Permission / Feature</TableCell>
              {state.roles.map(role => <TableCell key={role.id} variant="header" className="break-words">{role.name}</TableCell>)}
            </tr></thead>
            <tbody>{rows.map(permission => <tr key={permission.key} className="border-t border-border">
              <TableCell variant="header" scope="row" className="break-words bg-surface! text-body! text-ink!">
                {permission.name}{!known.has(permission.key) && <span className="mt-ah-4 block text-caption text-muted">Retained assignment; unavailable in the catalog.</span>}
              </TableCell>
              {state.roles.map(role => {
                const selected = state.drafts[role.id].includes(permission.key);
                const label = `${role.name}: ${permission.name}`;
                return <TableCell key={role.id}>{canManage ? <input type="checkbox" aria-label={label} checked={selected}
                  disabled={disabled || !known.has(permission.key)} className="size-5 accent-sidebar"
                  onChange={event => controller.toggle(role.id, permission.key, event.target.checked)} />
                  : <span aria-label={`${label}: ${selected ? "assigned" : "not assigned"}`}>{selected ? "✓" : "—"}</span>}
                </TableCell>;
              })}
            </tr>)}</tbody>
            {canManage && <tfoot><tr className="border-t border-border">
              <TableCell><p role="status" aria-live="polite" className="text-caption text-muted">
                {dirtyCount ? `${dirtyCount} ${dirtyCount === 1 ? "role has" : "roles have"} unsaved changes.` : "No unsaved changes."}
              </p></TableCell>
              {state.roles.map(role => {
                const dirty = !samePermissionKeys(role.permissionKeys, state.drafts[role.id]);
                return <TableCell key={role.id}><div className="flex flex-wrap gap-ah-8">
                  <Button aria-label={`Save permissions for ${role.name}`} disabled={disabled || !dirty || state.feedback[role.id]?.blocked}
                    onClick={() => void controller.save(role.id)}>{state.busyId === role.id ? "Working…" : "Save"}</Button>
                  <Button variant="secondary" aria-label={`Cancel changes for ${role.name}`} disabled={!!state.busyId || !dirty}
                    onClick={() => controller.discard(role.id)}>Cancel</Button>
                </div></TableCell>;
              })}
            </tr></tfoot>}
          </table>
        </div>
        {!rows.length && <p role="status" className="border-t border-border bg-surface p-ah-24 text-muted">No permissions are available.</p>}
      </div>
    </Section>
    <p className="text-caption text-muted">The matrix shows direct assignments. Inherited access is determined separately. Each Save updates only its role.</p>
    {unknown.length > 0 && <p role="status" className="text-caption text-warning">Assignments absent from the catalog are retained and cannot be changed here.</p>}
    {!state.permissions.length && <p role="status" className="text-muted">No editable permission definitions were returned.</p>}
    {state.authDenied && <div className="space-y-ah-12">
      <p role="alert" className="text-danger">Your access has changed. Further saves are disabled; unsaved selections are retained.</p>
      {needsSignIn && <ButtonLink href="/login" variant="secondary">Sign in</ButtonLink>}
    </div>}
    {state.roles.map(role => {
      const feedback = state.feedback[role.id];
      return feedback && <div key={role.id} className="space-y-ah-8 rounded-ah-8 border border-border bg-surface p-ah-16">
        <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-danger" : "text-ink"}><strong>{role.name}:</strong> {feedback.message}</p>
        {Object.entries(feedback.error?.fieldErrors ?? {}).map(([key, message]) => <p key={key} className="text-caption text-danger">{key}: {message}</p>)}
        {feedback.blocked && !state.authDenied && <>
          <p className="text-caption text-warning">Reload this role before saving again. Your selections will be preserved for review.</p>
          <Button variant="secondary" disabled={!!state.busyId} onClick={() => void controller.reload(role.id)}>Reload {role.name}</Button>
        </>}
        {feedback.effectiveKeys && <details className="text-caption text-muted"><summary className="cursor-pointer">Effective access returned for {role.name}</summary>
          <ul className="mt-ah-8 list-disc space-y-ah-4 pl-ah-24">{feedback.effectiveKeys.map(key => <li key={key} className="break-words">{state.permissions.find(item => item.key === key)?.name ?? key}</li>)}</ul>
          {!feedback.effectiveKeys.length && <p>No effective permissions were returned.</p>}
        </details>}
      </div>;
    })}
  </div>;
}
