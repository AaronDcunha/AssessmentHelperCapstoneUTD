"use client";

import { useState } from "react";
import { NavigationItem } from "@/components/layout/navigation-item";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";
import { CalendarIcon, ChartIcon, ClipboardIcon, DocumentIcon, GridIcon, PeopleIcon, ShieldIcon } from "@/components/ui/icons";

const previewPath = "/test/task-1/navigation-item";
const groups = [
  { name: "Faculty", items: [
    { label: "Dashboard", icon: GridIcon },
    { label: "My Evaluation", icon: DocumentIcon },
    { label: "Observer Requests", icon: PeopleIcon },
    { label: "Observations", icon: ClipboardIcon },
    { label: "History", icon: CalendarIcon },
  ] },
  { name: "Assessment Committee", items: [
    { label: "Dashboard", icon: GridIcon },
    { label: "Evaluation Cycles", icon: CalendarIcon },
    { label: "Faculty Due / Overdue", icon: PeopleIcon },
    { label: "Observation Progress", icon: ClipboardIcon },
    { label: "Observation Template", icon: DocumentIcon },
    { label: "Reports / KPIs", icon: ChartIcon },
    { label: "Semester Settings", icon: CalendarIcon },
  ] },
  { name: "Admin", items: [
    { label: "Dashboard", icon: GridIcon },
    { label: "Users", icon: PeopleIcon },
    { label: "Roles & Permissions", icon: ShieldIcon },
    { label: "Hiring Levels", icon: ChartIcon },
  ] },
];

export default function NavigationItemPreviewPage() {
  const [label, setLabel] = useState("Observation requests and assessment history");
  const [active, setActive] = useState("inactive");

  return (
    <div className="space-y-ah-24">
      <Section title="NavigationItem" description="Hover or Tab through the links to inspect their states. Single-line items use Figma's 248 by 44px reference. These are isolated examples, not permission-based application navigation.">
        <nav aria-label="Navigation state examples" className="w-fit max-w-full space-y-ah-16 rounded-ah-8 bg-sidebar p-ah-16">
          <NavigationItem label="Dashboard" href={`${previewPath}#destination`} icon={<GridIcon />} data-example="default" />
          <NavigationItem label="Hover over this item" href={`${previewPath}#destination`} icon={<CalendarIcon />} data-example="hover" />
          <NavigationItem label="Active destination" href={previewPath} active icon={<ClipboardIcon />} data-example="active" />
        </nav>
        <p className="mt-ah-16 text-body text-muted">Hover adds the green surface. Active also adds the orange marker and aria-current. Keyboard focus adds a light outline against the sidebar.</p>
      </Section>

      <Section title="Labels and sidebar contexts" description="Examples use the shared icons. Follow the Icons or Avatar link to verify real Next.js navigation; browser Back returns here. Active state is supplied explicitly by the parent.">
        <div className="grid items-start gap-ah-24 lg:grid-cols-3">
          {groups.map((group) => (
            <nav key={group.name} aria-label={`${group.name} examples`} className="min-w-0 rounded-ah-8 bg-sidebar p-ah-16">
              <h3 className="mb-ah-12 text-label text-light">{group.name}</h3>
              <ul className="space-y-ah-8">
                {group.items.map(({ label: text, icon: Icon }) => (
                  <li key={text}><NavigationItem label={text} href={`${previewPath}#destination`} icon={<Icon />} /></li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
        <nav aria-label="Working preview destinations" className="mt-ah-24 w-fit max-w-full space-y-ah-8 rounded-ah-8 bg-sidebar p-ah-16">
          <NavigationItem label="Icons preview" href="/test/task-1/icons" icon={<GridIcon />} data-example="icons-link" />
          <NavigationItem label="Avatar preview" href="/test/task-1/avatar" icon={<PeopleIcon />} data-example="avatar-link" />
        </nav>
      </Section>

      <Section title="Long labels and narrow layouts" description="Edit the label and active state. Text wraps instead of truncating; the link grows vertically and shrinks to fit its container while the shared icon stays 24px.">
        <div className="mb-ah-16 grid gap-ah-16 sm:grid-cols-2">
          <Input label="Navigation label" value={label} onChange={(event) => setLabel(event.target.value)} />
          <Select label="Destination state" value={active} onChange={(event) => setActive(event.target.value)}>
            <option value="inactive">Default</option>
            <option value="active">Active</option>
          </Select>
        </div>
        <nav aria-label="Narrow navigation example" className="w-[220px] max-w-full rounded-ah-8 bg-sidebar p-ah-16">
          <NavigationItem label={label || "Untitled preview destination"} href={`${previewPath}#destination`} icon={<DocumentIcon />} active={active === "active"} data-example="long-label" />
        </nav>
      </Section>

      <Section id="destination" title="Sample destination" description="The sample sidebar links navigate to this section. Production parents supply their real destinations and active state.">
        <p className="text-body text-ink">No authentication, permission filtering, or application layout changes are part of this preview.</p>
      </Section>
    </div>
  );
}
