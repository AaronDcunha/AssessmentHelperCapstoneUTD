"use client";

import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { adminRoutes } from "@/components/layout/navigation-config";
import { fetchUserRoles, type UserRole } from "./users-api";
import { createUsersListLoader, initialUsersState, userFiltersKey } from "./users-list-state";

export function UsersList({ canManageUsers, canReadRoles }: { canManageUsers: boolean; canReadRoles: boolean }) {
  const [q, setQ] = useState("");
  const [roleId, setRoleId] = useState("");
  const [accountStatus, setAccountStatus] = useState("");
  const [state, setState] = useState(initialUsersState);
  const [loader] = useState(() => createUsersListLoader(setState));
  const [catalog, setCatalog] = useState<{ items: UserRole[]; status: "loading" | "ready" | "error" }>({ items: [], status: "loading" });
  const [roleRetry, setRoleRetry] = useState(0);
  const [knownRoles, setKnownRoles] = useState<UserRole[]>([]);
  const search = q.trim();
  const status = accountStatus.trim();
  const filters = { q: search, roleId, accountStatus: status };
  const pending = state.key !== userFiltersKey(filters) || state.status === "loading";
  const items = pending ? [] : state.items;
  const error = pending ? null : state.error;

  useEffect(() => {
    const timer = window.setTimeout(() => { void loader.load({ q: search, roleId, accountStatus: status }); }, 300);
    return () => { window.clearTimeout(timer); loader.cancel(); };
  }, [loader, search, roleId, status]);

  useEffect(() => {
    if (!canReadRoles) return;
    const controller = new AbortController();
    void fetchUserRoles(controller.signal).then(
      items => { if (!controller.signal.aborted) setCatalog({ items, status: "ready" }); },
      () => { if (!controller.signal.aborted) setCatalog({ items: [], status: "error" }); },
    );
    return () => controller.abort();
  }, [canReadRoles, roleRetry]);

  // Remember role suggestions when changing filters.
  const roles = [...new Map([...catalog.items, ...knownRoles, ...items.flatMap(item => item.roles)].map(role => [role.id, role])).values()];
  const rememberOptions = () => { setKnownRoles(roles); };
  const cellClasses = "break-words";

  return (
    <div className="space-y-ah-24">
      <div role="search" aria-label="Find users" className="flex flex-wrap items-start gap-ah-16">
        <Input label="Search name or email" type="search" name="q" placeholder="Search…" value={q}
          onChange={event => { rememberOptions(); setQ(event.target.value); }}
          wrapperClassName="min-h-control-88 w-full max-w-[480px]" className="h-[58px] px-ah-16 py-ah-16" />
        <details className="min-w-0 flex-1 md:pt-ah-32">
          <summary className="cursor-pointer text-label text-sidebar">Filters{roleId || status ? " (active)" : ""}</summary>
          <div className="mt-ah-16 grid gap-ah-16 sm:grid-cols-2">
            <Select label="Role" name="roleId" value={roleId} onChange={event => { rememberOptions(); setRoleId(event.target.value); }}>
              <option value="">All roles</option>
              {roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
            <Select label="Account status" name="accountStatus" value={accountStatus}
              onChange={event => { rememberOptions(); setAccountStatus(event.target.value); }}>
              <option value="">All statuses</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
          <p className="mt-ah-8 text-caption text-muted">
            {!canReadRoles ? "Role options come from loaded users." : catalog.status === "loading" ? "Loading role options…"
              : catalog.status === "error" ? "Role catalog unavailable. Options include roles from loaded users." : null}
          </p>
          {canReadRoles && catalog.status === "error" && <Button variant="secondary" className="mt-ah-8"
            onClick={() => { setCatalog({ items: [], status: "loading" }); setRoleRetry(value => value + 1); }}>Retry role options</Button>}
          {(q || roleId || accountStatus) && <Button variant="secondary" className="mt-ah-8"
            onClick={() => { rememberOptions(); setQ(""); setRoleId(""); setAccountStatus(""); }}>Clear filters</Button>}
        </details>
      </div>

      {canManageUsers && <ButtonLink href={`${adminRoutes.users}/new`} className="h-11 w-full max-w-[260px] py-ah-8">Create User</ButtonLink>}

      <Section title="User accounts" variant="plain" className="[&>div:first-child]:sr-only">
        <div className="overflow-hidden rounded-ah-8 border border-border" aria-busy={pending || state.loadingMore}>
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Users table">
            <table className="w-full min-w-[800px] table-fixed [&_td]:h-[80px] [&_td]:w-1/5 [&_th]:h-[80px] [&_th]:w-1/5">
              <caption className="sr-only">User accounts matching the selected search and filters</caption>
              <thead><tr>{["Name", "Email", "Role", "Account status", "Action"].map(label => <TableCell key={label} variant="header">{label}</TableCell>)}</tr></thead>
              <tbody>
                {items.map(item => <tr key={item.id} className="border-t border-border">
                  <TableCell className={cellClasses}>{item.name}</TableCell>
                  <TableCell className={cellClasses}>{item.email || "—"}</TableCell>
                  <TableCell className={cellClasses}>{item.roles.map(role => role.name).join(", ") || "No roles"}</TableCell>
                  <TableCell className={cellClasses}>{item.accountStatus ? "Active" : "Inactive"}</TableCell>
                  <TableCell>{canManageUsers ? <TextAction href={`${adminRoutes.users}/${encodeURIComponent(item.id)}`} aria-label={`Edit ${item.name}`}>Edit</TextAction> : "—"}</TableCell>
                </tr>)}
              </tbody>
            </table>
          </div>
          {(pending || state.status === "error" || (!pending && state.status === "ready" && items.length === 0)) &&
            <div className="border-t border-border bg-surface p-ah-24 text-center">
              {pending ? <p role="status" className="text-muted">Loading users…</p> : error ? <>
                <p role="alert" className="text-danger">{error.message}</p>
                {error.kind === "unauthorized" ? <ButtonLink href="/login" variant="secondary" className="mt-ah-16">Sign in</ButtonLink>
                  : <Button variant="secondary" className="mt-ah-16" onClick={() => void loader.load(filters)}>Retry users</Button>}
              </> : <p role="status" className="text-muted">{search || roleId || status ? "No users match the selected search and filters." : "No users are available."}</p>}
            </div>}
        </div>
        {!pending && state.status === "ready" && <div className="mt-ah-16 flex flex-wrap items-center justify-between gap-ah-16">
          <p role="status" aria-live="polite" className="text-caption text-muted">{items.length} {items.length === 1 ? "user" : "users"} loaded.</p>
          {state.pageInfo.hasMore && <Button variant="secondary" disabled={state.loadingMore} onClick={() => void loader.loadMore(filters)}>
            {state.loadingMore ? "Loading more…" : error ? "Retry loading more" : "Load More"}
          </Button>}
          {error && <p role="alert" className="w-full text-danger">{error.message} Previously loaded users are still shown.</p>}
        </div>}
      </Section>
    </div>
  );
}
