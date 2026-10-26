"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { adminRoutes } from "@/components/layout/navigation-config";
import type { UserRole } from "./users-api";
import {
  deleteUser, fetchUserRoles, getDepartments, getHiringLevels, getUser,
  UserFormApiError, type Department, type FieldErrors, type HiringLevel, type UserRecord,
} from "./user-form-api";
import { draftFromUser, emptyUserDraft, rebaseDraft, saveUserDraft, validateUserDraft, type UserDraft } from "./user-form-model";

type Options<T> = { items: T[]; error: string | null; loading: boolean };
const emptyOptions = <T,>(): Options<T> => ({ items: [], error: null, loading: true });
const failureMessage = (error: unknown) => error instanceof Error ? error.message : "The service is unavailable. Please try again.";

export function UserForm({ userId }: { userId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<UserDraft>(emptyUserDraft);
  const [baseline, setBaseline] = useState<UserRecord | null>(null);
  const [recordState, setRecordState] = useState(userId ? "loading" : "ready");
  const [recordError, setRecordError] = useState<unknown>(null);
  const [roles, setRoles] = useState(emptyOptions<UserRole>);
  const [departments, setDepartments] = useState(emptyOptions<Department>);
  const [levels, setLevels] = useState(emptyOptions<HiringLevel>);
  const [optionRetry, setOptionRetry] = useState(0);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<UserFormApiError | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void getUser(userId, controller.signal).then(user => {
      if (!controller.signal.aborted) { setBaseline(user); setDraft(draftFromUser(user)); setRecordState("ready"); }
    }, error => {
      if (!controller.signal.aborted) { setRecordError(error); setRecordState("error"); }
    });
    return () => controller.abort();
  }, [userId]);

  useEffect(() => {
    const controller = new AbortController();
    function load<T>(request: (signal: AbortSignal) => Promise<T[]>, publish: (state: Options<T>) => void) {
      void request(controller.signal).then(items => {
        if (!controller.signal.aborted) publish({ items, loading: false, error: null });
      }, error => {
        if (!controller.signal.aborted) publish({ items: [], loading: false, error: failureMessage(error) });
      });
    }
    load(fetchUserRoles, setRoles);
    load(getDepartments, setDepartments);
    load(getHiringLevels, setLevels);
    return () => controller.abort();
  }, [optionRetry]);

  const roleOptions = [...roles.items];
  for (const id of baseline?.roleIds ?? []) if (!roleOptions.some(role => role.id === id)) roleOptions.push({ id, name: `Assigned role (${id})` });
  const disabled = busy || !!createdId || recordState !== "ready";
  const faculty = !!baseline?.professor || !!draft.hiringLevelId || !!draft.departmentId || !!draft.hireDate;
  const primaryRole = draft.roleIds[0] ?? "";
  const lookupErrors = [["Roles", roles], ["Hiring levels", levels], ["Departments", departments]] as const;
  const fieldError = (key: string) => fieldErrors[key] ?? fieldErrors[key.replace("professor.", "")];
  const change = <K extends keyof UserDraft>(key: K, value: UserDraft[K]) => {
    if (disabled) return;
    setDraft(previous => ({ ...previous, [key]: value }));
    setFieldErrors({});
    setNotice("");
  };
  function changeHiringLevel(value: string) {
    if (disabled) return;
    change("hiringLevelId", value);
    // An unsaved optional profile can be withdrawn; the draft has no delete-profile contract.
    if (!value && !baseline?.professor) setDraft(previous => ({ ...previous, departmentId: "", hireDate: "" }));
  }
  function focusFeedback() { window.requestAnimationFrame(() => feedback.current?.focus()); }
  function lock() { if (busyRef.current) return false; busyRef.current = true; setBusy(true); return true; }
  function unlock() { busyRef.current = false; setBusy(false); }

  async function reloadLatest() {
    if (!userId || !lock()) return;
    try {
      const latest = await getUser(userId);
      setDraft(previous => baseline ? rebaseDraft(previous, baseline, latest) : draftFromUser(latest));
      setBaseline(latest); setRecordState("ready"); setRecordError(null); setError(null); setBlocked(false); setFieldErrors({});
      setNotice("Latest record loaded. Unsaved edits are preserved; review them before saving.");
    } catch (error) {
      if (!baseline) { setRecordError(error); setRecordState("error"); }
      else setError(error instanceof UserFormApiError ? error : new UserFormApiError(failureMessage(error)));
    } finally { unlock(); focusFeedback(); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || blocked || !lock()) return;
    const errors = validateUserDraft(draft, baseline, roles.items.map(role => role.id));
    setFieldErrors(errors); setError(null); setNotice("");
    if (Object.keys(errors).length) {
      unlock();
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    const result = await saveUserDraft(draft, baseline);
    if (result.current) setBaseline(result.current);
    if (result.error) {
      setError(result.error); setFieldErrors(result.error.fieldErrors);
      setBlocked(result.error.uncertain || (!!userId && result.error.status === 409) || result.error.status === 401 || result.error.status === 403);
      if (result.detailsSaved) setNotice("Account details were saved. Role assignment did not complete; review the selected roles and retry. These operations are separate.");
    } else if (result.current) {
      setDraft(draftFromUser(result.current));
      setNotice(userId ? "Changes saved." : "User created.");
      if (!userId) setCreatedId(result.current.id);
    }
    unlock(); focusFeedback();
  }
  async function remove() {
    if (!userId || blocked || !lock()) return;
    setError(null); setNotice("");
    try {
      await deleteUser(userId);
      router.push(adminRoutes.users); router.refresh();
      // Keep controls locked until navigation completes after a confirmed deletion.
    } catch (error) {
      const failure = error instanceof UserFormApiError ? error : new UserFormApiError(failureMessage(error), 0, {}, true);
      setError(failure); setBlocked(failure.uncertain || [401, 403, 409].includes(failure.status));
      setConfirmDelete(false); unlock(); focusFeedback();
    }
  }
  function retryOptions() {
    setRoles(previous => ({ ...previous, loading: true, error: null }));
    setDepartments(previous => ({ ...previous, loading: true, error: null }));
    setLevels(previous => ({ ...previous, loading: true, error: null }));
    setOptionRetry(value => value + 1);
  }

  return (
    <form method="post" noValidate onSubmit={save} className="space-y-ah-24" aria-busy={busy || recordState === "loading"}>
      {recordState === "loading" && <p role="status" className="text-muted">Loading user…</p>}
      {recordState === "error" && <div role="alert" className="space-y-ah-16">
        <p className="text-danger">{failureMessage(recordError)}</p>
        <Button variant="secondary" onClick={() => void reloadLatest()} disabled={busy}>Retry loading user</Button>
        {recordError instanceof UserFormApiError && recordError.status === 401 && <ButtonLink href="/login">Sign in</ButtonLink>}
      </div>}
      <Section title="Account details" className="rounded-ah-8! [&>div:first-child]:sr-only">
        <fieldset disabled={disabled} className="grid max-w-[984px] grid-cols-1 gap-x-ah-24 gap-y-ah-16 min-[1200px]:grid-cols-2">
          <legend className="sr-only">User account and faculty profile</legend>
          <Input label="Full Name" name="name" autoComplete="name" placeholder="Enter name" value={draft.name}
            onChange={event => change("name", event.target.value)} required error={fieldError("name")}
            wrapperClassName="min-h-control-88 min-w-0" className="h-[58px] px-ah-16 py-ah-16" />
          <Input label="Email" name="email" type="email" autoComplete="email" placeholder="Enter email" value={draft.email}
            onChange={event => change("email", event.target.value)} required error={fieldError("email")}
            wrapperClassName="min-h-control-88 min-w-0" className="h-[58px] px-ah-16 py-ah-16" />
          <div className="min-w-0">
            <Select label="System Role" name="roleIds" value={primaryRole} required error={fieldError("roleIds")}
              onChange={event => change("roleIds", [...new Set([event.target.value, ...draft.roleIds])].filter(Boolean))}
              wrapperClassName="min-h-control-88" className="h-[58px] px-ah-16 py-ah-16 enabled:bg-surface!">
              <option value="" disabled>Select role</option>
              {roleOptions.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}
            </Select>
            {roleOptions.length > 1 && <details className="mt-ah-8">
              <summary className="cursor-pointer text-caption text-sidebar">Additional roles ({Math.max(0, draft.roleIds.length - 1)})</summary>
              <div className="mt-ah-8 space-y-ah-8">
                {roleOptions.filter(role => role.id !== primaryRole).map(role => <label key={role.id} className="flex items-center gap-ah-8 text-label">
                  <input type="checkbox" checked={draft.roleIds.includes(role.id)} onChange={event => change("roleIds", event.target.checked
                    ? [...draft.roleIds, role.id] : draft.roleIds.filter(id => id !== role.id))} />{role.name}
                </label>)}
                <p className="text-caption text-muted">Selecting a role retains existing assignments. Uncheck additional roles to remove them. Assigned roles are separate from inherited access.</p>
              </div>
            </details>}
          </div>
          <Select label="Faculty Hiring Level" name="hiringLevelId" value={draft.hiringLevelId}
            onChange={event => changeHiringLevel(event.target.value)} required={faculty} error={fieldError("professor.hiringLevelId")}
            wrapperClassName="min-h-control-88 min-w-0" className="h-[58px] px-ah-16 py-ah-16 enabled:bg-surface!">
            <option value="" disabled={!!baseline?.professor}>Select hiring level</option>
            {baseline?.professor && !levels.items.some(level => level.id === baseline.professor?.hiringLevelId) &&
              <option value={baseline.professor.hiringLevelId}>Current hiring level</option>}
            {levels.items.map(level => <option key={level.id} value={level.id} disabled={!level.active && level.id !== baseline?.professor?.hiringLevelId}>
              {level.name}{level.active ? "" : " (inactive)"}
            </option>)}
          </Select>
          <Select label="Account Status" name="accountStatus" value={draft.accountStatus} required error={fieldError("accountStatus")}
            onChange={event => change("accountStatus", event.target.value)} wrapperClassName="min-h-control-88 min-w-0"
            className="h-[58px] px-ah-16 py-ah-16 enabled:bg-surface!">
            <option value="" disabled>Select account status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </Select>
          {faculty && <>
            <Select label="Department" name="departmentId" value={draft.departmentId} required error={fieldError("professor.departmentId")}
              onChange={event => change("departmentId", event.target.value)} wrapperClassName="min-h-control-88 min-w-0"
              className="h-[58px] px-ah-16 py-ah-16 enabled:bg-surface!">
              <option value="" disabled>Select department</option>
              {baseline?.professor && !departments.items.some(department => department.id === baseline.professor?.departmentId) &&
                <option value={baseline.professor.departmentId}>Current department</option>}
              {departments.items.map(department => <option key={department.id} value={department.id}>{department.code} — {department.name}</option>)}
            </Select>
            <Input label="Hire Date (optional)" name="hireDate" type="date" value={draft.hireDate} error={fieldError("professor.hireDate")}
              onChange={event => change("hireDate", event.target.value)} wrapperClassName="min-h-control-88 min-w-0"
              className="h-[58px] px-ah-16 py-ah-16" />
          </>}
        </fieldset>
      </Section>
      <div className="space-y-ah-8 text-caption text-muted">
        <p>Faculty profiles are optional. Selecting a hiring level requires a department. Existing faculty profiles are preserved.</p>
        {lookupErrors.some(([, options]) => options.loading) && <p role="status">Loading form options…</p>}
        {lookupErrors.filter(([, options]) => options.error).map(([label, options]) => <p key={label} role="alert" className="text-danger">{label}: {options.error}</p>)}
        {!roles.loading && !roles.error && !roles.items.length && <p role="status">No assignable roles are available. Existing assignments are preserved.</p>}
        {faculty && !departments.loading && !departments.error && !departments.items.length && <p role="status">No department options are available. An existing department can be retained.</p>}
        {(lookupErrors.some(([, options]) => options.error)
          || (!roles.loading && !roles.items.length)) && <Button variant="secondary" disabled={busy} onClick={retryOptions}>Retry form options</Button>}
      </div>
      <div ref={feedback} tabIndex={-1} className="space-y-ah-12">
        {notice && <p role="status">{notice}</p>}
        {error && <p role="alert" className="text-danger">{error.message}</p>}
        {Object.entries(fieldErrors).map(([key, value]) => <p key={key} className="text-caption text-danger">{key}: {value}</p>)}
        {blocked && <p className="text-warning">{userId ? "Saving and deletion are paused. Reload the latest record, then review your preserved edits."
          : "Saving is paused to avoid creating a duplicate. Check the Users list before starting another creation."}</p>}
        {error?.status === 401 && <ButtonLink href="/login" variant="secondary">Sign in</ButtonLink>}
        {userId && blocked && <Button variant="secondary" disabled={busy} onClick={() => void reloadLatest()}>Reload latest record</Button>}
        {createdId && <ButtonLink href={`${adminRoutes.users}/${encodeURIComponent(createdId)}`}>Edit created user</ButtonLink>}
      </div>
      <div className="space-y-ah-16">
        {userId && <Button variant="secondary" className="h-11 w-[200px] max-w-full bg-danger-bg! py-ah-0! text-danger! hover:bg-danger-bg"
          disabled={disabled || blocked} onClick={() => setConfirmDelete(true)}>Delete User</Button>}
        <div className="flex flex-wrap gap-ah-16">
          <Button variant="secondary" className="h-11 w-[260px] max-w-full py-ah-0! text-sidebar" disabled={busy} onClick={() => router.push(adminRoutes.users)}>
            {createdId ? "Back to Users" : "Cancel"}
          </Button>
          {!createdId && <Button type="submit" className="h-11 w-[260px] max-w-full py-ah-0!" disabled={disabled || blocked}>
            {busy ? "Saving…" : "Save Changes"}
          </Button>}
        </div>
      </div>
      {confirmDelete && <DeleteUserDialog busy={busy} onCancel={() => setConfirmDelete(false)} onConfirm={() => void remove()} />}
    </form>
  );
}

function DeleteUserDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal(); cancel.current?.focus();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
    onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}
    className="m-auto max-h-[calc(100dvh_-_2rem)] w-[560px] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-ah-8 border border-border bg-surface p-ah-24 text-ink backdrop:bg-ink/40">
    <h2 id={`${id}-title`} className="text-section">Delete user?</h2>
    <p id={`${id}-description`} className="mt-ah-16">Confirm deletion of this account. The server may reject deletion to preserve history or protect administrator access.</p>
    <div className="mt-ah-24 flex flex-wrap gap-ah-16">
      <Button ref={cancel} variant="secondary" disabled={busy} onClick={onCancel}>Cancel</Button>
      <Button variant="danger" disabled={busy} onClick={onConfirm}>{busy ? "Deleting…" : "Delete User"}</Button>
    </div>
  </dialog>;
}
