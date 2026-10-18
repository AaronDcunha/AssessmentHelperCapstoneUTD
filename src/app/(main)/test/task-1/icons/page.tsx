"use client";

import { useState } from "react";
import {
  GridIcon, CalendarIcon, PersonIcon, PeopleIcon, ClipboardIcon, DocumentIcon,
  ChartIcon, ShieldIcon, BookIcon, DownIcon, UpIcon, BellIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

const icons = [
  { name: "Grid", Icon: GridIcon }, { name: "Calendar", Icon: CalendarIcon },
  { name: "Person", Icon: PersonIcon }, { name: "People", Icon: PeopleIcon },
  { name: "Clipboard", Icon: ClipboardIcon }, { name: "Document", Icon: DocumentIcon },
  { name: "Chart", Icon: ChartIcon }, { name: "Shield", Icon: ShieldIcon },
  { name: "Book", Icon: BookIcon }, { name: "Down", Icon: DownIcon },
  { name: "Up", Icon: UpIcon }, { name: "Bell", Icon: BellIcon },
];

export default function SharedIconsPreviewPage() {
  const [size, setSize] = useState(24);
  const [surface, setSurface] = useState("green");
  const [activations, setActivations] = useState(0);

  return (
    <div className="space-y-ah-24">
      <Section title="Shared icons" description="All twelve Figma masters. The initial 24px icons use light text on the green surface. Change the size or surface to inspect scaling and inherited color.">
        <div className="mb-ah-24 flex flex-wrap gap-ah-16">
          <Select label="Icon size" value={size} onChange={(event) => setSize(Number(event.target.value))} wrapperClassName="w-full sm:w-[200px]">
            {[16, 24, 32, 48].map((value) => <option key={value} value={value}>{value}px</option>)}
          </Select>
          <Select label="Preview surface" value={surface} onChange={(event) => setSurface(event.target.value)} wrapperClassName="w-full sm:w-[240px]">
            <option value="green">Green surface / light icons</option>
            <option value="light">Light surface / green icons</option>
          </Select>
        </div>
        <ul aria-label="Shared icon gallery" className={`grid grid-cols-2 gap-ah-24 rounded-ah-8 p-ah-16 sm:grid-cols-3 lg:grid-cols-6 ${surface === "green" ? "bg-sidebar text-light" : "border border-border bg-surface text-sidebar"}`}>
          {icons.map(({ name, Icon }) => (
            <li key={name} className="min-w-0 space-y-ah-8">
              <Icon data-icon={name} size={size} />
              <p className="break-words text-label">{name}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Size examples" description="The view box stays 24×24 as each icon scales. CSS sizing also works; the final example follows its surrounding text size.">
        <div className="flex flex-wrap items-end gap-ah-32 text-sidebar">
          {[16, 24, 32, 48].map((value) => (
            <figure key={value} className="space-y-ah-8">
              <CalendarIcon size={value} data-size-example={value} />
              <figcaption className="text-caption text-muted">{value}px</figcaption>
            </figure>
          ))}
          <p className="flex items-center gap-ah-8 text-section"><BookIcon size="1em" data-size-example="em" />1em</p>
        </div>
      </Section>

      <Section title="Accessible and decorative usage" description="Named standalone images are exposed to assistive technology. Icons next to text or inside named buttons are decorative. Actions below update a local counter.">
        <div className="flex flex-wrap items-start gap-ah-32">
          <figure className="max-w-[240px] space-y-ah-8">
            <BellIcon size={32} aria-label="Notifications available" className="text-ink" data-example="named" />
            <figcaption className="text-caption text-muted">Standalone icon named with aria-label.</figcaption>
          </figure>
          <figure className="max-w-[240px] space-y-ah-8">
            <ChartIcon size={32} aria-labelledby="report-icon-caption" className="text-sidebar" data-example="labelledby" />
            <figcaption id="report-icon-caption" className="text-label text-ink">Sample assessment report</figcaption>
          </figure>
          <p className="flex items-center gap-ah-8 text-body text-ink"><ShieldIcon className="text-sidebar" data-example="decorative" />Decorative icon with visible text</p>
        </div>
        <div className="mt-ah-24 flex flex-wrap gap-ah-16">
          <Button onClick={() => setActivations((count) => count + 1)}><CalendarIcon />Preview schedule action</Button>
          <Button variant="secondary" aria-label="Preview notifications" onClick={() => setActivations((count) => count + 1)}><BellIcon /></Button>
        </div>
        <p role="status" aria-atomic="true" className="mt-ah-16 text-body text-muted">Preview activations: {activations}.</p>
      </Section>
    </div>
  );
}
