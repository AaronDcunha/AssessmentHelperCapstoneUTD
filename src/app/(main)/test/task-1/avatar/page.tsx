"use client";

import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

const edgeCases = [
  { id: "missing", label: "Missing initials", initials: undefined },
  { id: "empty", label: "Empty initials", initials: "" },
  { id: "whitespace", label: "Whitespace only", initials: "   " },
  { id: "long-initials", label: "Long initials", initials: "ABCDEFGH" },
  { id: "long-name", label: "Alexandra Catherine Montgomery", initials: "Alexandra Catherine Montgomery" },
  { id: "unicode", label: "Accented initials", initials: "e\u0301 o\u0308" },
];

export default function AvatarPreviewPage() {
  const [initials, setInitials] = useState("JD");
  const [name, setName] = useState("Jordan Davis");
  const [size, setSize] = useState(40);
  const [usage, setUsage] = useState("meaningful");
  const [activations, setActivations] = useState(0);

  return (
    <div className="space-y-ah-24">
      <Section title="Avatar" description="Figma's default is a 40px circle. Edit the sample identity, size, and accessibility mode. Long input is abbreviated visually; the supplied accessible name stays complete.">
        <div className="mb-ah-24 grid gap-ah-16 sm:grid-cols-2">
          <Input label="Initials or sample name" value={initials} onChange={(event) => setInitials(event.target.value)} />
          <Input label="Accessible name" value={name} onChange={(event) => setName(event.target.value)} hint="Used for the meaningful avatar, not decorative examples." />
          <Select label="Avatar size" value={size} onChange={(event) => setSize(Number(event.target.value))}>
            {[24, 32, 40, 56, 64].map((value) => <option key={value} value={value}>{value}px</option>)}
          </Select>
          <Select label="Accessibility mode" value={usage} onChange={(event) => setUsage(event.target.value)}>
            <option value="meaningful">Meaningful standalone image</option>
            <option value="decorative">Decorative beside visible name</option>
          </Select>
        </div>
        <div className="flex min-w-0 items-center gap-ah-12 rounded-ah-8 border border-border bg-canvas p-ah-16">
          {usage === "meaningful" ? (
            <Avatar initials={initials} size={size} aria-label={name} data-example="interactive" />
          ) : (
            <Avatar initials={initials} size={size} decorative data-example="interactive" />
          )}
          <p className="min-w-0 break-words text-body text-ink">{usage === "decorative" ? name || "No sample name supplied" : `Standalone avatar · ${size}px`}</p>
        </div>
      </Section>

      <Section title="Reference and sizes" description="Initials and dimensions are supplied by this preview. The first example preserves the Figma master; the others scale the same avatar.">
        <div className="flex flex-wrap items-end gap-ah-24">
          <figure className="space-y-ah-8"><Avatar initials="JD" decorative data-example="reference" /><figcaption className="text-caption text-muted">Default 40px</figcaption></figure>
          {[24, 32, 56, 64].map((value, index) => (
            <figure key={value} className="space-y-ah-8">
              <Avatar initials={["AL", "MR", "PK", "TS"][index]} size={value} decorative data-size-example={value} />
              <figcaption className="text-caption text-muted">{value}px</figcaption>
            </figure>
          ))}
        </div>
      </Section>

      <Section title="Missing and long input" description="Missing or blank initials use the shared Person icon. A single token is limited to two graphemes; a multiword name uses its first and last initials. Accented characters remain intact.">
        <ul className="grid gap-ah-24 sm:grid-cols-2 lg:grid-cols-3">
          {edgeCases.map((example) => (
            <li key={example.id} className="flex min-w-0 items-center gap-ah-12">
              <Avatar initials={example.initials} decorative data-edge-case={example.id} />
              <span className="min-w-0 break-words text-body text-ink">{example.label}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Accessible and decorative usage" description="A named standalone avatar is exposed as an image. Beside a visible name or inside a named button, keep the avatar decorative so identity is announced once. The example button updates a local counter.">
        <div className="flex flex-wrap items-center gap-ah-24">
          <Avatar initials="MR" aria-label="Morgan Reed" data-example="named" />
          <div className="flex min-w-0 max-w-full items-center gap-ah-12">
            <Avatar initials="AL" decorative data-example="adjacent" />
            <span className="min-w-0 break-words text-body text-ink">Alexandra Catherine Montgomery</span>
          </div>
          <Button variant="secondary" aria-label="Preview profile for Priya Kumar" onClick={() => setActivations((count) => count + 1)}>
            <Avatar initials="PK" size={32} decorative />
          </Button>
        </div>
        <p role="status" aria-atomic="true" className="mt-ah-16 text-body text-muted">Preview profile activations: {activations}.</p>
      </Section>
    </div>
  );
}
