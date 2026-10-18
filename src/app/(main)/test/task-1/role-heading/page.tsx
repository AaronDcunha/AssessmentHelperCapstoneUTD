"use client";

import { useId, useState } from "react";
import { NavigationItem } from "@/components/layout/navigation-item";
import { RoleHeading } from "@/components/layout/role-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form-fields";
import { GridIcon, DocumentIcon, PeopleIcon, PersonIcon, ShieldIcon } from "@/components/ui/icons";
import { Section } from "@/components/ui/section";

const groups = [
  { id: "faculty", label: "Faculty", icon: PersonIcon, items: [
    { label: "Dashboard", icon: GridIcon },
    { label: "My Evaluation", icon: DocumentIcon },
  ] },
  { id: "ac", label: "Assessment Committee", icon: PeopleIcon, items: [
    { label: "Dashboard", icon: GridIcon },
    { label: "Observation Template", icon: DocumentIcon },
  ] },
  { id: "admin", label: "Admin", icon: ShieldIcon, items: [
    { label: "Dashboard", icon: GridIcon },
    { label: "Roles & Permissions", icon: ShieldIcon },
  ] },
] as const;

type GroupId = typeof groups[number]["id"];
const initialExpanded: Record<GroupId, boolean> = { faculty: true, ac: false, admin: false };
const previewDestination = "/test/task-1/role-heading#destination";

export default function RoleHeadingPreviewPage() {
  const prefix = useId();
  const [expanded, setExpanded] = useState(initialExpanded);
  const [longLabel, setLongLabel] = useState("Assessment Committee for Teaching and Faculty Development");
  const [longExpanded, setLongExpanded] = useState(false);

  return (
    <div className="space-y-ah-24">
      <Section title="RoleHeading" description="Toggle each heading using a pointer, Enter, or Space. The parent controls expansion and hides the associated panel. These independent examples contain sample links, not authentication or permission rules.">
        <div className="mb-ah-24 flex flex-wrap gap-ah-12">
          <Button variant="secondary" onClick={() => setExpanded({ faculty: true, ac: true, admin: true })} data-example="expand-all">Expand all</Button>
          <Button variant="secondary" onClick={() => setExpanded({ faculty: false, ac: false, admin: false })} data-example="collapse-all">Collapse all</Button>
        </div>
        <div className="grid grid-cols-1 items-start gap-ah-24 lg:grid-cols-3">
          {groups.map(({ id, label, icon: Icon, items }) => (
            <nav key={id} aria-label={`${label} preview`} className="min-w-0 w-[288px] max-w-full rounded-ah-8 bg-sidebar p-ah-16">
              <RoleHeading
                id={`${prefix}-${id}-heading`}
                label={label}
                icon={<Icon />}
                expanded={expanded[id]}
                onExpandedChange={(next) => setExpanded((current) => ({ ...current, [id]: next }))}
                aria-controls={`${prefix}-${id}-panel`}
                data-role-example={id}
              />
              <ul id={`${prefix}-${id}-panel`} hidden={!expanded[id]} className="space-y-ah-8">
                {items.map(({ label: text, icon: ItemIcon }) => (
                  <li key={text}><NavigationItem label={text} href={previewDestination} icon={<ItemIcon />} /></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <p role="status" aria-atomic="true" className="mt-ah-16 text-body text-muted">
          Expanded sample sections: {groups.filter(({ id }) => expanded[id]).map(({ label }) => label).join(", ") || "none"}.
        </p>
      </Section>

      <Section title="Long labels and narrow containers" description="Edit this role label, then expand its panel. The icon and chevron stay 24px while the complete label wraps; the heading grows vertically as needed.">
        <Input label="Custom role label" value={longLabel} onChange={(event) => setLongLabel(event.target.value)} />
        <nav aria-label="Custom role preview" className="mt-ah-24 w-[220px] max-w-full rounded-ah-8 bg-sidebar p-ah-16">
          <RoleHeading
            label={longLabel || "Custom role"}
            icon={<PeopleIcon />}
            expanded={longExpanded}
            onExpandedChange={setLongExpanded}
            aria-controls={`${prefix}-custom-panel`}
            data-role-example="long-label"
          />
          <ul id={`${prefix}-custom-panel`} hidden={!longExpanded}>
            <li><NavigationItem label="Sample navigation destination" href={previewDestination} icon={<DocumentIcon />} /></li>
          </ul>
        </nav>
      </Section>

      <Section id="destination" title="Sample destination" description="Expanded navigation links lead to this section using Next.js Link.">
        <p className="text-body text-ink">Collapsed panels stay in the DOM with hidden set, so aria-controls always points to an existing panel and hidden links leave the keyboard navigation order.</p>
      </Section>
    </div>
  );
}
