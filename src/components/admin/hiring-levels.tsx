"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";
import { TextAction } from "@/components/ui/text-action";
import { createHiringLevelsController, hiringLevelDirty, initialHiringLevelsState, type HiringLevelsState } from "./hiring-levels-state";

export function HiringLevels({ canManage }: { canManage: boolean }) {
  const [state, setState] = useState<HiringLevelsState>(initialHiringLevelsState);
  const [controller] = useState(() => createHiringLevelsController(setState));
  useEffect(() => { void controller.load(); return () => controller.cancel(); }, [controller]);
  const ready = state.status === "ready";
  const disabled = state.busy || state.authDenied || !ready;
  const editor = state.editor;
  const fieldErrors = editor?.fieldErrors;
  const editorError = editor?.error;
  const editorNotice = editor?.notice;
  const hasFieldErrors = !!fieldErrors && Object.keys(fieldErrors).length > 0;
  const feedback = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fieldErrors && Object.keys(fieldErrors).length) {
      const invalid = document.querySelector<HTMLElement>('dialog [aria-invalid="true"]');
      (invalid ?? feedback.current)?.focus();
    }
  }, [fieldErrors]);
  useEffect(() => {
    if ((editorError || editorNotice) && !hasFieldErrors) feedback.current?.focus();
  }, [editorError, editorNotice, hasFieldErrors]);

  return <div className="space-y-ah-24">
    {canManage && <Button data-add-hiring-level className="h-11 w-[260px] max-w-full py-ah-0!" disabled={disabled || state.uncertainCreate}
      onClick={() => controller.open("add")}>Add Hiring Level</Button>}
    <Section title="Hiring levels" variant="plain" className="[&>div:first-child]:sr-only">
      <div className="overflow-hidden rounded-ah-8 border border-border" aria-busy={state.busy || state.status === "loading"}>
        <div className="overflow-x-auto" role="region" aria-label="Hiring levels table" tabIndex={0}>
          <table className="w-full min-w-[760px] table-fixed [&_td]:h-[80px] [&_td]:w-auto! [&_th]:h-[80px] [&_th]:w-auto!">
            <caption className="sr-only">Hiring levels, evaluation frequency, status and management actions</caption>
            <colgroup><col style={{ width: `${300 / 1096 * 100}%` }} /><col /><col style={{ width: 180 }} /></colgroup>
            <thead><tr>{["Hiring level", "Evaluation frequency", "Action"].map(label => <TableCell key={label} variant="header">{label}</TableCell>)}</tr></thead>
            <tbody>{ready && state.items.map(level => <tr key={level.id} className="border-t border-border">
              <TableCell className="break-words">{level.name}<span className="mt-ah-4 block text-caption text-muted">{level.active ? "Active" : "Inactive"}</span></TableCell>
              <TableCell>Every {level.evaluationIntervalYears} calendar {level.evaluationIntervalYears === 1 ? "year" : "years"}</TableCell>
              <TableCell>{canManage ? <div className="flex items-center gap-ah-8">
                <TextAction className="h-10 w-[74px] min-w-0! shrink-0" disabled={disabled} aria-label={`Edit ${level.name}`}
                  onClick={() => controller.open("edit", level.id)}>Edit</TextAction>
                <TextAction className="h-10 w-[74px] min-w-0! shrink-0" disabled={disabled} aria-label={`Remove ${level.name}`}
                  onClick={() => controller.open("remove", level.id)}>Remove</TextAction>
              </div> : <span aria-label="Read only">—</span>}</TableCell>
            </tr>)}</tbody>
          </table>
        </div>
        {state.status === "loading" && <p role="status" className="border-t border-border bg-surface p-ah-24 text-muted">Loading hiring levels…</p>}
        {state.status === "error" && <div className="space-y-ah-16 border-t border-border bg-surface p-ah-24">
          <p role="alert" className="text-danger">{state.error?.message}</p>
          {state.error?.status === 401 ? <ButtonLink href="/login" variant="secondary">Sign in</ButtonLink>
            : <Button variant="secondary" onClick={() => void controller.load()}>Retry hiring levels</Button>}
        </div>}
        {ready && !state.items.length && <p role="status" className="border-t border-border bg-surface p-ah-24 text-muted">No hiring levels are available.</p>}
      </div>
    </Section>
    {state.notice && <p role="status">{state.notice}</p>}
    {state.authDenied && <p role="alert" className="text-danger">Your access has changed. Further changes are disabled.{editor ? " Unsaved input is retained in the dialog." : ""}</p>}
    {state.uncertainCreate && !editor && <div className="space-y-ah-12">
      <p role="alert" className="text-warning">The add request could not be verified. Reload and check the list before starting another add on a fresh page.</p>
      <Button variant="secondary" disabled={state.status === "loading"} onClick={() => void controller.load()}>Reload hiring levels</Button>
    </div>}
    {editor && <HiringLevelDialog title={editor.kind === "add" ? "Add Hiring Level" : editor.kind === "edit" ? "Edit Hiring Level" : "Remove Hiring Level?"}
      description={editor.kind === "remove" ? `Remove ${editor.original?.name}? Removal may be refused if this hiring level is in use. Changing its active status is a separate action available through Edit.` : undefined}
      busy={state.busy} destructive={editor.kind === "remove"} onClose={controller.close}>
      <form method="post" noValidate onSubmit={event => { event.preventDefault(); if (canManage) void controller.submit(); }} className="mt-ah-16 space-y-ah-16" aria-busy={state.busy}>
        {editor.kind !== "remove" && <fieldset disabled={state.busy || state.authDenied} className="space-y-ah-16">
            <legend className="sr-only">Hiring-level details</legend>
            <Input label="Hiring level" name="name" required value={editor.draft.name} error={editor.fieldErrors.name}
              onChange={event => controller.change("name", event.target.value)} className="h-control-56 px-ah-16" />
            <Input label="Evaluation interval (years)" name="evaluationIntervalYears" type="number" min={1} step={1} required
              value={editor.draft.evaluationIntervalYears} error={editor.fieldErrors.evaluationIntervalYears}
              onChange={event => controller.change("evaluationIntervalYears", event.target.value)} className="h-control-56 px-ah-16"
              hint="Enter a positive whole number of calendar years." />
            {editor.kind === "edit" && <label className="flex items-center gap-ah-8 text-label">
              <input name="active" type="checkbox" className="size-5 accent-sidebar" checked={editor.draft.active === true}
                onChange={event => controller.change("active", event.target.checked)} />Active
            </label>}
          </fieldset>}
        <div ref={feedback} tabIndex={-1} className="space-y-ah-8">
          {editor.error && <p role="alert" className="text-danger">{editor.error.message}</p>}
          {Object.entries(editor.fieldErrors).filter(([key]) => key !== "name" && key !== "evaluationIntervalYears")
            .map(([key, message]) => <p key={key} className="text-danger">{key}: {message}</p>)}
          {editor.notice && <p role="status">{editor.notice}</p>}
          {editor.error?.status === 401 && <ButtonLink href="/login" variant="secondary">Sign in</ButtonLink>}
          {editor.blocked && !state.authDenied && <>
            <p className="text-caption text-warning">{editor.kind === "add" ? "Do not repeat this add request. Close the dialog, then reload and inspect the list before creating again."
              : "Reload this hiring level before trying again. Your input will be preserved for review."}</p>
            {editor.original && <Button variant="secondary" disabled={state.busy} onClick={() => void controller.reloadEditor()}>Reload latest hiring level</Button>}
          </>}
        </div>
        <div className="flex flex-wrap gap-ah-16">
          <Button variant="secondary" data-dialog-cancel disabled={state.busy} className="h-11 w-[200px] max-w-full py-ah-0!" onClick={controller.close}>Cancel</Button>
          <Button type="submit" variant={editor.kind === "remove" ? "danger" : "primary"} className="h-11 w-[200px] max-w-full py-ah-0!"
            disabled={!canManage || state.busy || state.authDenied || editor.blocked || (editor.kind === "edit" && !hiringLevelDirty(editor))}>
            {state.busy ? "Working…" : editor.kind === "remove" ? "Remove Hiring Level" : "Save"}
          </Button>
        </div>
      </form>
    </HiringLevelDialog>}
  </div>;
}

function HiringLevelDialog({ title, description, busy, destructive, onClose, children }: {
  title: string; description?: string; busy: boolean; destructive: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element?.showModal();
    element?.querySelector<HTMLElement>(destructive ? "[data-dialog-cancel]" : "input")?.focus();
    return () => {
      element?.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
      else document.querySelector<HTMLButtonElement>("[data-add-hiring-level]")?.focus();
    };
  }, [destructive]);
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} aria-describedby={description ? `${id}-description` : undefined}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
    className="m-auto max-h-[calc(100dvh_-_2rem)] w-[560px] max-w-[calc(100%_-_2rem)] overflow-y-auto rounded-ah-8 border border-border bg-surface p-ah-24 text-ink backdrop:bg-ink/40">
    <h2 id={`${id}-title`} className="text-section">{title}</h2>
    {description && <p id={`${id}-description`} className="mt-ah-16">{description}</p>}
    {children}
  </dialog>;
}
