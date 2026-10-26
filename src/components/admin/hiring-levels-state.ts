import { AdminApiError, type FieldErrors } from "./admin-api";
import { createHiringLevel, getHiringLevels, patchHiringLevel, removeHiringLevel, type HiringLevel, type HiringLevelPatch } from "./hiring-levels-api";

export type HiringLevelDraft = { name: string; evaluationIntervalYears: string; active: boolean | null };
export type HiringLevelEditor = {
  kind: "add" | "edit" | "remove"; original: HiringLevel | null; draft: HiringLevelDraft;
  fieldErrors: FieldErrors; error: AdminApiError | null; blocked: boolean; notice: string;
};
export type HiringLevelsState = {
  status: "loading" | "ready" | "error"; items: HiringLevel[]; error: AdminApiError | null;
  editor: HiringLevelEditor | null; busy: boolean; authDenied: boolean; uncertainCreate: boolean; notice: string;
};
export const initialHiringLevelsState: HiringLevelsState = {
  status: "loading", items: [], error: null, editor: null, busy: false, authDenied: false, uncertainCreate: false, notice: "",
};
const draftFrom = (level: HiringLevel): HiringLevelDraft => ({ name: level.name, evaluationIntervalYears: String(level.evaluationIntervalYears), active: level.active });
export function validateHiringLevel(draft: HiringLevelDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.name.trim()) errors.name = "Enter a hiring-level name.";
  const interval = Number(draft.evaluationIntervalYears);
  if (!/^\d+$/.test(draft.evaluationIntervalYears) || !Number.isSafeInteger(interval) || interval < 1) {
    errors.evaluationIntervalYears = "Enter a positive whole number of years.";
  }
  return errors;
}
export function hiringLevelDirty(editor: HiringLevelEditor) {
  if (!editor.original) return true;
  return editor.draft.name.trim() !== editor.original.name || Number(editor.draft.evaluationIntervalYears) !== editor.original.evaluationIntervalYears
    || editor.draft.active !== editor.original.active;
}
export function rebaseHiringLevel(draft: HiringLevelDraft, before: HiringLevel, latest: HiringLevel): HiringLevelDraft {
  const previous = draftFrom(before);
  return { name: draft.name.trim() === before.name ? latest.name : draft.name,
    evaluationIntervalYears: /^\d+$/.test(draft.evaluationIntervalYears) && Number(draft.evaluationIntervalYears) === before.evaluationIntervalYears
      ? String(latest.evaluationIntervalYears) : draft.evaluationIntervalYears,
    active: draft.active === previous.active ? latest.active : draft.active };
}
const failure = (error: unknown, mutation = false) => error instanceof AdminApiError ? error
  : new AdminApiError("The operation could not be verified. Reload the hiring levels before retrying.", 0, {}, mutation);

export function createHiringLevelsController(publish: (state: HiringLevelsState) => void, api = {
  list: getHiringLevels, create: createHiringLevel, patch: patchHiringLevel, remove: removeHiringLevel,
}) {
  let state = initialHiringLevelsState;
  let generation = 0;
  let read: AbortController | undefined;
  const update = (next: HiringLevelsState) => { state = next; publish(next); };
  const cancel = () => { generation++; read?.abort(); };
  async function load() {
    if (state.busy || state.editor) return;
    cancel();
    const current = generation;
    read = new AbortController();
    update({ ...state, status: "loading", error: null });
    try {
      const items = await api.list(read.signal);
      if (generation !== current) return;
      update({ ...state, items, status: "ready" });
    } catch (error) {
      if (generation !== current) return;
      update({ ...state, status: "error", error: failure(error) });
    }
  }
  function open(kind: HiringLevelEditor["kind"], id?: string) {
    if (state.busy || state.authDenied || state.editor || state.status !== "ready" || (kind === "add" && state.uncertainCreate)) return;
    const original = id ? state.items.find(item => item.id === id) : null;
    if (kind !== "add" && !original) return;
    update({ ...state, notice: "", editor: { kind, original: original ?? null,
      draft: original ? draftFrom(original) : { name: "", evaluationIntervalYears: "", active: null },
      fieldErrors: {}, error: null, blocked: false, notice: "" } });
  }
  function change<K extends keyof HiringLevelDraft>(key: K, value: HiringLevelDraft[K]) {
    if (!state.editor || state.busy || state.authDenied) return;
    update({ ...state, editor: { ...state.editor, draft: { ...state.editor.draft, [key]: value }, fieldErrors: {},
      error: state.editor.blocked ? state.editor.error : null, notice: "" } });
  }
  function close() {
    if (state.busy) return;
    update({ ...state, editor: null });
  }
  async function submit() {
    const editor = state.editor;
    if (!editor || state.busy || state.authDenied || editor.blocked) return;
    if (editor.kind !== "remove") {
      const fieldErrors = validateHiringLevel(editor.draft);
      if (Object.keys(fieldErrors).length) { update({ ...state, editor: { ...editor, fieldErrors } }); return; }
      if (editor.kind === "edit" && !hiringLevelDirty(editor)) return;
    }
    const current = generation;
    update({ ...state, busy: true, editor: { ...editor, error: null, fieldErrors: {}, notice: "" } });
    try {
      let items: HiringLevel[];
      if (editor.kind === "remove" && editor.original) {
        await api.remove(editor.original.id);
        items = state.items.filter(item => item.id !== editor.original!.id);
      } else if (editor.kind === "edit" && editor.original) {
        const patch: HiringLevelPatch = { expectedRevision: editor.original.revision };
        if (editor.draft.name.trim() !== editor.original.name) patch.name = editor.draft.name.trim();
        if (Number(editor.draft.evaluationIntervalYears) !== editor.original.evaluationIntervalYears) patch.evaluationIntervalYears = Number(editor.draft.evaluationIntervalYears);
        if (typeof editor.draft.active === "boolean" && editor.draft.active !== editor.original.active) patch.active = editor.draft.active;
        const saved = await api.patch(editor.original.id, patch);
        items = state.items.map(item => item.id === saved.id ? saved : item);
      } else {
        const saved = await api.create({ name: editor.draft.name.trim(), evaluationIntervalYears: Number(editor.draft.evaluationIntervalYears) });
        if (state.items.some(item => item.id === saved.id)) throw new AdminApiError("The add response identified an existing level. Verify the list before creating again.", 200, {}, true);
        items = [...state.items, saved];
      }
      if (generation !== current) return;
      update({ ...state, items, busy: false, editor: null,
        notice: editor.kind === "remove" ? "Hiring level removed." : editor.kind === "add" ? "Hiring level added." : "Hiring level saved." });
    } catch (error) {
      if (generation !== current) return;
      const rejected = failure(error, true);
      const denied = [401, 403].includes(rejected.status);
      update({ ...state, busy: false, authDenied: denied || state.authDenied,
        uncertainCreate: state.uncertainCreate || (editor.kind === "add" && rejected.uncertain),
        editor: { ...editor, error: rejected, fieldErrors: rejected.fieldErrors,
          blocked: rejected.uncertain || denied || (editor.kind !== "add" && [404, 409].includes(rejected.status)) } });
    }
  }
  async function reloadEditor() {
    const editor = state.editor;
    if (!editor?.original || state.busy || state.authDenied) return;
    const current = generation;
    read = new AbortController();
    update({ ...state, busy: true });
    try {
      const items = await api.list(read.signal);
      if (generation !== current) return;
      const latest = items.find(item => item.id === editor.original!.id);
      if (!latest) {
        update({ ...state, items, busy: false, editor: { ...editor, blocked: true, error: new AdminApiError(editor.kind === "remove"
          ? "This level is no longer listed, but no deletion response was confirmed. No further removal will be attempted."
          : "This hiring level is no longer available. Your edits are retained; saving is disabled.", 404) } });
        return;
      }
      update({ ...state, items, busy: false, editor: { ...editor, original: latest,
        draft: rebaseHiringLevel(editor.draft, editor.original, latest), error: null, fieldErrors: {}, blocked: false,
        notice: "Latest hiring level loaded. Review your preserved changes before proceeding." } });
    } catch (error) {
      if (generation !== current) return;
      const rejected = failure(error);
      update({ ...state, busy: false, authDenied: state.authDenied || [401, 403].includes(rejected.status),
        editor: { ...editor, error: rejected, blocked: true } });
    }
  }
  return { load, open, change, close, submit, reloadEditor, cancel };
}
