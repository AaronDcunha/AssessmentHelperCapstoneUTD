"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { createNavigationConfig, filterNavigation, navigationDefinitions, type NavigationBindings } from "@/components/layout/navigation-config";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

// All routes below are working preview anchors. They are not proposed production URLs or permissions.
const bindings: NavigationBindings = {};
for (const section of navigationDefinitions) for (const item of section.items) bindings[item.id] = { href: `/test/task-1/sidebar#${item.id}` };
const sampleSections = createNavigationConfig(bindings);
const allItems = sampleSections.flatMap((section) => section.items);
const standardUser = { name: "Jordan Davis", initials: "JD", description: "Faculty · AC · Admin" };

function allowedFor(preset: string) {
  if (preset === "combined") return allItems.map((item) => item.id);
  if (preset === "limited") return ["faculty.dashboard", "ac.reports", "admin.users"];
  return sampleSections.find((section) => section.id === preset)?.items.map((item) => item.id) ?? [];
}

export default function SidebarPreviewPage() {
  const [preset, setPreset] = useState("faculty");
  const [allowed, setAllowed] = useState(() => allowedFor("faculty"));
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ faculty: true, ac: true, admin: true });
  const [activeId, setActiveId] = useState("faculty.dashboard");
  const [identity, setIdentity] = useState("standard");
  const [labels, setLabels] = useState("standard");
  const [width, setWidth] = useState("288");
  const [prefilteredExpanded, setPrefilteredExpanded] = useState<Record<string, boolean>>({ faculty: true });

  useEffect(() => {
    const update = () => {
      const hash = window.location.hash.slice(1);
      setActiveId(allItems.some((item) => item.id === hash) ? hash : "faculty.dashboard");
    };
    update();
    window.addEventListener("hashchange", update);
    window.addEventListener("popstate", update);
    return () => { window.removeEventListener("hashchange", update); window.removeEventListener("popstate", update); };
  }, []);

  const sections = labels === "long" ? sampleSections.map((section) => ({
    ...section, label: `${section.label} for Teaching and Faculty Development`,
    items: section.items.map((item) => ({ ...item, label: `${item.label} with extended navigation details` })),
  })) : sampleSections;
  const user = identity === "missing" ? undefined : identity === "long" ? {
    name: "AlexandraCatherineMontgomeryWithAnUnbrokenLongName", initials: "Alexandra Catherine Montgomery",
    description: "Faculty development and assessment committee administration",
    accessibleName: "Current user Alexandra Catherine Montgomery",
  } : standardUser;

  return (
    <div className="space-y-ah-24">
      <Section title="Sidebar playground" description="Authorization examples use explicit allowed destination IDs, not role grants or production permission strings. The identity footer is display-only and never changes which links are allowed. All links lead to working preview anchors.">
        <div className="mb-ah-24 grid grid-cols-1 gap-ah-16 sm:grid-cols-2">
          <Select label="Authorized navigation example" value={preset} onChange={(event) => { setPreset(event.target.value); setAllowed(allowedFor(event.target.value)); }} data-example="authorization">
            <option value="faculty">Faculty only</option><option value="ac">Assessment Committee only</option><option value="admin">Admin only</option>
            <option value="combined">Combined access</option><option value="limited">Limited destinations across sections</option><option value="none">No authorized destinations</option>
            <option value="custom">Custom destination selection</option>
          </Select>
          <Select label="Sample identity" value={identity} onChange={(event) => setIdentity(event.target.value)} data-example="identity">
            <option value="standard">Standard identity</option><option value="missing">Missing user information</option><option value="long">Long visible name and spoken alternative</option>
          </Select>
          <Select label="Navigation labels" value={labels} onChange={(event) => setLabels(event.target.value)} data-example="labels">
            <option value="standard">Figma labels</option><option value="long">Long labels</option>
          </Select>
          <Select label="Sidebar container width" value={width} onChange={(event) => setWidth(event.target.value)} data-example="width">
            <option value="288">288px reference</option><option value="220">220px narrow container</option>
          </Select>
          <Select label="Active destination (parent-supplied sample state)" value={activeId} onChange={(event) => setActiveId(event.target.value)} data-example="active">
            {allItems.map((item) => <option key={item.id} value={item.id}>{item.id}: {item.label}</option>)}
          </Select>
        </div>
        <details className="mb-ah-24 rounded-ah-8 border border-border p-ah-16">
          <summary className="cursor-pointer text-label text-ink">Choose allowed sample destinations individually</summary>
          <div className="mt-ah-16 grid grid-cols-1 gap-ah-16 sm:grid-cols-2">
            {allItems.map((item) => (
              <Input key={item.id} label={`${item.id}: ${item.label}`} type="checkbox" checked={allowed.includes(item.id)}
                className="self-start" style={{ width: 20, height: 20, padding: 0 }} data-allow-item={item.id}
                onChange={(event) => { setPreset("custom"); setAllowed((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id)); }} />
            ))}
          </div>
        </details>
        <div className="mb-ah-24 flex flex-wrap gap-ah-12">
          <Button variant="secondary" onClick={() => setExpanded({ faculty: true, ac: true, admin: true })} data-example="expand-all">Expand all</Button>
          <Button variant="secondary" onClick={() => setExpanded({ faculty: false, ac: false, admin: false })} data-example="collapse-all">Collapse all</Button>
          <Button variant="secondary" onClick={() => { setPreset("combined"); setAllowed(allowedFor("combined")); setExpanded({ faculty: true, ac: false, admin: false }); }} data-example="figma-reference">Show Figma Faculty expansion</Button>
        </div>
        <p role="status" className="mb-ah-16 text-body text-muted" data-example="selection-status">Allowed sample destinations: {allowed.length}. Active sample destination: {activeId}.</p>
        <div className="max-w-full" style={{ width: Number(width) }}>
          <Sidebar sections={sections} canAccess={(item) => allowed.includes(item.id)}
            expandedSections={expanded} onExpandedChange={(id, next) => setExpanded((current) => ({ ...current, [id]: next }))}
            activeItemId={activeId} onItemNavigate={(item) => setActiveId(item.id)} user={user}
            navigationLabel="Interactive sidebar navigation" data-example="interactive-sidebar" />
        </div>
      </Section>

      <Section title="Prefiltered navigation handoff" description="This second instance receives only one already-authorized destination and needs no authorization predicate. It has its own expansion state and panel IDs.">
        <Sidebar authorizedSections={filterNavigation(sampleSections, (item) => item.id === "faculty.dashboard")}
          expandedSections={prefilteredExpanded} onExpandedChange={(id, next) => setPrefilteredExpanded((current) => ({ ...current, [id]: next }))}
          user={standardUser} navigationLabel="Prefiltered sidebar navigation" data-example="prefiltered-sidebar" />
      </Section>

      <Section title="Sample destinations" description="These destination IDs and anchors belong to this preview. Production routes and permission bindings must be supplied by the integration owner.">
        <ul className="space-y-ah-16">
          {allItems.map((item) => <li key={item.id} id={item.id} className="scroll-mt-ah-24 text-body text-ink [overflow-wrap:anywhere]">{item.id}: {item.label}</li>)}
        </ul>
      </Section>
    </div>
  );
}
