"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AssessmentQuestionEditor } from "@/components/ac/assessment-question-editor";
import { TemplatePreview } from "@/components/ac/template-preview";
import { useApiResource } from "@/components/ac/use-api-resource";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { acApi, type ObservationTemplate, type TemplateSummary } from "@/lib/ac-api";
import { configurationError, moveItem, moveQuestion, newTemplate, templateDraft, templatePayload, type EditorCriterion, type TemplateDraft } from "@/lib/ac-configuration";

const EMPTY: TemplateSummary[] = [];
const tabs = ["Scale questions", "Long responses", "Comments & signatures"];

export function ObservationTemplateEditor() {
  const [retry, setRetry] = useState(0);
  const result = useApiResource(useCallback(async () => {
    void retry; // Explicit retry creates a new resource request.
    try { return await acApi.getTemplates(); }
    catch (error) { throw new Error(configurationError(error)); }
  }, [retry]), EMPTY);
  if (result.loading) return <p role="status">Loading observation templates…</p>;
  if (result.error) return <Section title="Observation templates unavailable"><p role="alert" className="text-danger">{result.error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry templates</Button></Section>;
  return <TemplateWorkspace initial={result.data} />;
}

function TemplateWorkspace({ initial }: { initial: TemplateSummary[] }) {
  const [summaries, setSummaries] = useState(initial);
  const [selection, setSelection] = useState(initial.length === 1 ? initial[0].id : "");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [created, setCreated] = useState<ObservationTemplate | null>(null);
  function choose(id: string) {
    if (busy || (dirty && !window.confirm("Discard unsaved template changes?"))) return;
    setDirty(false); setCreated(null); setSelection(id); setReload(value => value + 1);
  }
  function saved(template: ObservationTemplate) {
    setSummaries(current => current.some(item => item.id === template.id) ? current.map(item => item.id === template.id ? template : item) : [...current, template]);
    // Keep the same editor mounted after a create so the returned IDs/revision
    // become the next save's baseline without losing the current section.
    setCreated(template);
  }
  const activeId = selection === "new" && created ? created.id : selection;
  return <div className="space-y-ah-24">
    <div className="flex flex-wrap items-end gap-ah-16">
      <Select label="Observation template" name="templateId" value={activeId} disabled={busy} wrapperClassName="min-w-0 flex-1" onChange={event => choose(event.target.value)}>
        <option value="">Select a draft or published template</option>
        {selection === "new" && !created && <option value="new">New unsaved template</option>}
        {summaries.map(item => <option key={item.id} value={item.id}>{item.title} — {item.status === "draft" ? "Draft" : "Published"}</option>)}
      </Select>
      <Button variant="secondary" disabled={busy} onClick={() => choose("new")}>+ New template</Button>
    </div>
    {!summaries.length && !selection && <p role="status" className="text-muted">No templates exist. Create a draft to begin.</p>}
    {!selection && summaries.length > 0 && <p className="text-muted">Choose an existing template, including a draft, or create a new one.</p>}
    {selection && <TemplateLoader key={`${selection}-${reload}`} id={selection} onSaved={saved} onDirty={setDirty} onBusy={setBusy} reload={() => choose(activeId)} />}
  </div>;
}

function TemplateLoader({ id, onSaved, onDirty, onBusy, reload }: { id: string; onSaved: (template: ObservationTemplate) => void; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; reload: () => void }) {
  const [retry, setRetry] = useState(0);
  const result = useApiResource(useCallback(async () => {
    void retry;
    if (id === "new") return null;
    try { return await acApi.getTemplate(id); }
    catch (error) { throw new Error(configurationError(error)); }
  }, [id, retry]), null);
  if (result.loading) return <p role="status">Loading template…</p>;
  if (result.error) return <div className="space-y-ah-12"><p role="alert" className="text-danger">{result.error}</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Retry template</Button></div>;
  return <TemplateForm initial={result.data} onSaved={onSaved} onDirty={onDirty} onBusy={onBusy} reload={reload} />;
}

function TemplateForm({ initial, onSaved, onDirty, onBusy, reload }: { initial: ObservationTemplate | null; onSaved: (template: ObservationTemplate) => void; onDirty: (dirty: boolean) => void; onBusy: (busy: boolean) => void; reload: () => void }) {
  const [saved, setSaved] = useState(initial);
  const [baseline, setBaseline] = useState<TemplateDraft>(() => initial ? templateDraft(initial) : newTemplate());
  const [draft, setDraft] = useState(baseline);
  const [section, setSection] = useState(0);
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [conflict, setConflict] = useState(false);
  const busy = useRef(false);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function edit(action: (current: TemplateDraft) => TemplateDraft) { setDraft(action); setMessage(null); setSuccess(false); }
  function question(id: string, change: Partial<EditorCriterion>) {
    edit(current => ({ ...current, criteria: current.criteria.map(item => item.uiId === id ? { ...item, ...change } : item) }));
  }
  function addQuestion() {
    const uid = crypto.randomUUID();
    const type = section === 0 ? "rating" : "text";
    edit(current => ({ ...current, criteria: [...current.criteria, { uiId: `new-${uid}`, key: `question_${uid}`, prompt: "", type, required: true, order: current.criteria.length, weight: 1,
      ...(type === "rating" ? { options: ["Unsatisfactory", "Needs improvement", "Satisfactory", "Good", "Excellent"].map((label, index) => ({ value: index + 1, label })) } : {}) }] }));
  }
  function accept(template: ObservationTemplate) {
    const hydrated = templateDraft(template);
    setSaved(template); setBaseline(hydrated); setDraft(hydrated); onSaved(template); setConflict(false);
  }
  async function save(publish = false) {
    if (busy.current) return;
    setMessage(null); setSuccess(false); setConflict(false);
    try {
      const payload = templatePayload(draft);
      if (publish && (!saved || dirty)) throw new Error("Save your current changes before publishing this draft.");
      if (publish && !window.confirm("Publish this saved template for Faculty use?")) return;
      busy.current = true; setSaving(true); onBusy(true);
      const result = publish ? await acApi.publishTemplate(saved!.id, saved!.revision)
        : saved ? await acApi.updateTemplate(saved.id, { ...payload, expectedRevision: saved.revision }) : await acApi.createTemplate(payload);
      if (active.current) { accept(result); setSuccess(true); setMessage(publish ? "Template published." : result.status === "draft" ? "Draft saved. Publish when ready for Faculty use." : "Published template changes saved."); }
    } catch (error) { if (active.current) { setMessage(configurationError(error)); setConflict((error as { status?: number }).status === 409); } }
    finally { busy.current = false; if (active.current) { setSaving(false); onBusy(false); } }
  }

  if (preview) return <TemplatePreview draft={draft} onBack={() => setPreview(false)} />;
  const questions = draft.criteria.filter(item => item.type === (section === 0 ? "rating" : "text"));
  return <Section variant="plain" title="Faculty observation form" actions={<Button variant="secondary" onClick={() => setPreview(true)} disabled={saving}>Preview form</Button>} contentClassName="space-y-ah-24">
    <div className="flex flex-wrap gap-ah-12" role="tablist" aria-label="Template sections" onKeyDown={event => {
      if (saving || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (section + (event.key === "ArrowRight" ? 1 : 2)) % 3;
      setSection(next); event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="tab"]')[next]?.focus();
    }}>
      {tabs.map((tab, index) => <Button key={tab} id={`template-tab-${index}`} role="tab" tabIndex={section === index ? 0 : -1} aria-selected={section === index} aria-controls="template-panel" variant={section === index ? "primary" : "secondary"} disabled={saving} onClick={() => setSection(index)}>{index + 1}&nbsp; {tab}</Button>)}
    </div>
    <div className="flex flex-wrap items-center gap-ah-12">
      <span className="rounded-ah-pill bg-neutral-bg px-ah-12 py-ah-4 text-label">{saved ? saved.status === "published" ? "Published" : "Saved draft" : "Unsaved draft"}</span>
      {dirty && <span className="text-caption text-warning">Unsaved changes</span>}
      {saved && <span className="text-caption text-muted">Revision {saved.revision}</span>}
    </div>
    {saved?.status === "published" && <p className="text-caption text-warning">Saving edits changes this published template in place, including what linked assessments display. Removing referenced questions is restricted by the server.</p>}
    <fieldset disabled={saving} className="min-w-0 space-y-ah-24">
      <Input label="Template title" maxLength={2000} value={draft.title} onChange={event => edit(current => ({ ...current, title: event.target.value }))} />
      <div role="tabpanel" id="template-panel" aria-labelledby={`template-tab-${section}`} className="space-y-ah-16">
        <h3 className="text-section">{tabs[section]}</h3>
        <p className="text-body text-muted">{section === 0 ? "Edit the scale questions and their configured rating values and labels." : section === 1 ? "Edit the prompts Faculty will answer in their own words." : "Edit the comment prompts and signature labels shown on the Faculty form."}</p>
        {section < 2 ? <>
          {section === 0 && questions[0]?.options && <div className="flex flex-wrap gap-ah-16 rounded-ah-8 bg-neutral-bg p-ah-12 text-caption text-muted"><span className="text-label text-ink">Response scale · Question 1</span>{questions[0].options.map((option, index) => <span key={index}>{option.value} {option.label}</span>)}</div>}
          {!questions.length && <p className="text-muted">No {section === 0 ? "scale" : "long-response"} questions. Add a question to begin.</p>}
          {questions.map((item, index) => <AssessmentQuestionEditor key={item.uiId} questionId={item.uiId} questionNumber={index + 1} value={item.prompt} onChange={(id, prompt) => question(id, { prompt })} onRemove={id => edit(current => ({ ...current, criteria: current.criteria.filter(value => value.uiId !== id) }))}>
            <div className="flex flex-wrap items-end gap-ah-16">
              <label className="flex min-h-11 items-center gap-ah-8 text-label"><input type="checkbox" checked={item.required} onChange={event => question(item.uiId, { required: event.target.checked })} />Required</label>
              <Input label="Weight" type="number" min="0" step="any" value={Number.isFinite(item.weight ?? 1) ? item.weight ?? 1 : ""} wrapperClassName="w-[120px]" onChange={event => question(item.uiId, { weight: event.target.value === "" ? NaN : Number(event.target.value) })} />
              <Button variant="secondary" aria-label={`Move question ${index + 1} up`} disabled={index === 0} onClick={() => edit(current => ({ ...current, criteria: moveQuestion(current.criteria, item.uiId, -1) }))}>↑ Move up</Button>
              <Button variant="secondary" aria-label={`Move question ${index + 1} down`} disabled={index === questions.length - 1} onClick={() => edit(current => ({ ...current, criteria: moveQuestion(current.criteria, item.uiId, 1) }))}>↓ Move down</Button>
            </div>
            {item.type === "rating" && <details className="mt-ah-8"><summary className="cursor-pointer text-label text-sidebar">Edit response scale ({item.options?.length ?? 0} options)</summary><div className="mt-ah-12 space-y-ah-12">
              {(item.options ?? []).map((option, position) => <div key={position} className="flex flex-wrap items-end gap-ah-12">
                <Input label={`Rating ${position + 1} value`} type="number" step="1" wrapperClassName="w-[120px]" value={Number.isFinite(option.value) ? option.value : ""} onChange={event => question(item.uiId, { options: item.options!.map((value, at) => at === position ? { ...value, value: event.target.value === "" ? NaN : Number(event.target.value) } : value) })} />
                <Input label={`Rating ${position + 1} label`} maxLength={2000} wrapperClassName="min-w-0 flex-1" value={option.label} onChange={event => question(item.uiId, { options: item.options!.map((value, at) => at === position ? { ...value, label: event.target.value } : value) })} />
                <Button variant="secondary" disabled={item.options!.length <= 2} onClick={() => question(item.uiId, { options: item.options!.filter((_, at) => at !== position) })}>Remove rating {position + 1}</Button>
              </div>)}
              <Button variant="secondary" disabled={(item.options?.length ?? 0) >= 20} onClick={() => { const used = item.options!.map(value => value.value); let value = 1; while (used.includes(value)) value++; question(item.uiId, { options: [...item.options!, { value, label: "" }] }); }}>+ Add rating</Button>
            </div></details>}
          </AssessmentQuestionEditor>)}
          <div className="flex items-center justify-between gap-ah-12"><Button variant="secondary" disabled={draft.criteria.length >= 100} onClick={addQuestion}>+ Add question</Button><p className="text-label text-muted">{questions.length} questions</p></div>
        </> : <>
          {draft.commentPrompts.map((item, index) => <Section key={item.uiId} headingLevel={4} title={`Comment prompt ${index + 1}`} actions={<Button variant="secondary" onClick={() => edit(current => ({ ...current, commentPrompts: current.commentPrompts.filter(value => value.uiId !== item.uiId) }))}>Remove comment {index + 1}</Button>} contentClassName="space-y-ah-12">
            <Input label="Comment prompt text" value={item.prompt} maxLength={2000} onChange={event => edit(current => ({ ...current, commentPrompts: current.commentPrompts.map(value => value.uiId === item.uiId ? { ...value, prompt: event.target.value } : value) }))} />
            <div className="flex flex-wrap items-center gap-ah-16">
              <label className="flex min-h-11 items-center gap-ah-8 text-label"><input type="checkbox" checked={item.required} onChange={event => edit(current => ({ ...current, commentPrompts: current.commentPrompts.map(value => value.uiId === item.uiId ? { ...value, required: event.target.checked } : value) }))} />Required</label>
              <Button variant="secondary" disabled={index === 0} onClick={() => edit(current => ({ ...current, commentPrompts: moveItem(current.commentPrompts, index, -1) }))}>↑ Move comment up</Button>
              <Button variant="secondary" disabled={index === draft.commentPrompts.length - 1} onClick={() => edit(current => ({ ...current, commentPrompts: moveItem(current.commentPrompts, index, 1) }))}>↓ Move comment down</Button>
            </div>
          </Section>)}
          <Button variant="secondary" disabled={draft.commentPrompts.length >= 100} onClick={() => edit(current => ({ ...current, commentPrompts: [...current.commentPrompts, { uiId: crypto.randomUUID(), prompt: "", required: false, order: current.commentPrompts.length }] }))}>+ Add comment prompt</Button>
          <Section title="Signatures" headingLevel={4} description="These labels appear beneath the comment section." contentClassName="space-y-ah-16">
            {(["observee", "observer"] as const).map(role => <Input key={role} label={`${role === "observee" ? "Faculty / observee" : "Observer"} signature label`} maxLength={2000} value={draft.signatureLabels[role]} onChange={event => edit(current => ({ ...current, signatureLabels: { ...current.signatureLabels, [role]: event.target.value } }))} />)}
          </Section>
        </>}
      </div>
    </fieldset>
    {message && <p role={success ? "status" : "alert"} className={success ? "text-sidebar" : "text-danger"}>{message}</p>}
    {conflict && <Button variant="secondary" disabled={saving} onClick={reload}>Reload latest template (discard edits)</Button>}
    <div className="flex flex-wrap items-center justify-between gap-ah-16">
      <div className="flex flex-wrap gap-ah-12">
        <Button variant="secondary" disabled={saving} onClick={() => { if (!dirty || window.confirm("Discard unsaved template changes?")) { setDraft(baseline); setMessage(null); setConflict(false); } }}>Cancel</Button>
        {section > 0 && <Button variant="secondary" disabled={saving} onClick={() => setSection(value => value - 1)}>← Previous section</Button>}
      </div>
      <div className="flex flex-wrap gap-ah-12">
        <Button disabled={saving} onClick={() => save()}>{saving ? "Saving…" : "Save template"}</Button>
        {saved?.status === "draft" && <Button variant="secondary" disabled={saving || dirty} onClick={() => save(true)}>Publish template</Button>}
        {section < 2 && <Button variant="secondary" disabled={saving} onClick={() => setSection(value => value + 1)}>Next section →</Button>}
      </div>
    </div>
    {saved?.status === "draft" && dirty && <p className="text-caption text-muted">Save changes before publishing.</p>}
  </Section>;
}
