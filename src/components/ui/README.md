# Shared UI components

## Sections

Use `Section` from `@/components/ui/section` for a standard content card. It owns the surface, border, radius, padding, heading typography, and spacing, and automatically associates the section with its heading.

```tsx
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";

<Section
  title="Faculty details"
  description="Review and update the account information."
  actions={<Button type="submit" form="faculty-form">Save</Button>}
>
  <form id="faculty-form">{/* Page-specific fields */}</form>
</Section>
```

`title` and `children` supply the heading and content. `description` and `actions` are optional. Use `headingLevel` (1–6, default 2) for the page's heading hierarchy; the login card uses `headingLevel={1}`. Heading level controls HTML semantics while the shared `text-section` style stays consistent. Use `className` for the section and `contentClassName` for content layouts such as grids. Native section props, including `id`, refs, and accessible attributes, are supported. Both Server and Client Components can render Section; event handlers must be supplied from a Client Component.

`Section` also accepts an optional `eyebrow` for text above its title, such as
`<Section eyebrow="Assessment Helper" title="Login" headingLevel={1}>`.

Use `variant="plain"` for an unboxed section, such as the Admin Dashboard's
Administration links. It retains the accessible heading and heading/content gap
without the card background, border, radius, or padding. The default is `"card"`.

## Buttons and form fields

Import `Button` / `ButtonLink` from `@/components/ui/button` and `Input`, `Textarea`, `Select` from `@/components/ui/form-fields`.

These controls accept their native React HTML props, including refs, accessible attributes, styles, and className. Pages own values, event handlers, validation, and submission. Put event handlers and state in a Client Component (`"use client"`). Static buttons and links can be rendered by Server Components.

```tsx
"use client";

import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Textarea, Select } from "@/components/ui/form-fields";

export function Example() {
  const [password, setPassword] = useState("");
  return (
    <form onSubmit={(event) => { event.preventDefault(); /* Call the page's save function. */ }}>
      <Input label="Password" name="password" type="password"
        autoComplete="new-password" required minLength={12}
        value={password} onChange={(event) => setPassword(event.target.value)}
        hint="Use at least 12 characters." />
      <Input label="Account email" name="email" type="email"
        value="faculty@example.edu" readOnly />
      <Textarea label="Comments" name="comments" maxLength={2000} />
      <Select label="Semester" name="semester" defaultValue="fall" required>
        <option value="fall">Fall</option>
        <option value="spring">Spring</option>
      </Select>
      <Button type="submit">Save</Button>
      <Button variant="secondary" onClick={() => setPassword("")}>Clear password</Button>
      <ButtonLink href="/test">Continue</ButtonLink>
    </form>
  );
}
```

- Buttons support `variant="primary" | "secondary" | "danger"`, `fullWidth`, `disabled`, and native form props. Default type is `button`; opt into `submit` or `reset` explicitly.
- ButtonLink accepts Next.js Link props, including `href`, `replace`, `prefetch`, and anchor props such as `target`. Links do not have a disabled state; render a disabled Button when an action is unavailable.
- Fields require a `label` and associate it with an explicit or generated ID. Optional `hint` and `error` are linked through `aria-describedby`; errors also set `aria-invalid`. Existing description IDs are preserved.
- Use native props for password/email/date/number inputs, `readOnly`, `disabled`, `required`, `min`, `max`, `step`, `pattern`, `autoComplete`, `value`/`defaultValue`, and events. Select has no native readOnly behavior; use disabled if appropriate. Disabled controls are omitted from form data; read-only inputs are included.
- Use `className` for the control and `wrapperClassName` for the field container. Input also supports native checkbox/radio types via `checked`/`onChange`; their layout can be adjusted with these classes.
- UI validation does not replace server validation or authorization.

## Shared icons

Import from `@/components/ui/icons`: `GridIcon`, `CalendarIcon`, `PersonIcon`, `PeopleIcon`, `ClipboardIcon`, `DocumentIcon`, `ChartIcon`, `ShieldIcon`, `BookIcon`, `DownIcon`, `UpIcon`, and `BellIcon`. All accept the exported `IconProps` type.

The geometry comes directly from the Figma masters: a `0 0 24 24` view box, no fill, 1.7px strokes, and round caps/joins. `size` defaults to `24` and accepts a number or SVG length such as `"1em"`. Strokes scale with the icon. `className` and native SVG props (including refs) are supported. Use inherited color or semantic classes such as `text-sidebar`, `text-ink`, and `text-light`; no palette color is embedded in the paths. Use light icons on green surfaces and darker icons on light surfaces.

```tsx
import { CalendarIcon, BellIcon, ChartIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

// Decorative: a nearby label or the parent control already explains the icon.
<span><CalendarIcon className="text-sidebar" /> Observation date</span>
<Button aria-label="Open notifications" onClick={onOpenNotifications}>
  <BellIcon />
</Button>

// Meaningful standalone image: supply one nonempty naming attribute.
<BellIcon size={32} aria-label="Unread notifications" className="text-ink" />
<ChartIcon size="1em" aria-labelledby="report-label" />
<span id="report-label">Assessment report</span>
```

Unnamed icons are decorative by default (`aria-hidden="true"`). A nonempty `aria-label` or `aria-labelledby` makes the icon an image (`role="img"`). `decorative={false}` can be explicit, but requires one of those naming attributes; `decorative={true}` forbids them in TypeScript. A referenced label must exist in the page. Blank names fall back to decorative at runtime. Icons do not enter the Tab order; put actions on a real Button or link and label that control, rather than making an SVG interactive.

The icon module has no client directive, hooks, or browser dependencies and can be used in Server and Client Components. Event handlers belong in Client Components. The interactive preview is `/test/task-1/icons`. Task 1 supplies the Calendar icon for Person 2's existing `calendarIcon` prop; these exports do not change those components or the shared layout.

## Avatar

Import `Avatar` and its `AvatarProps` type from `@/components/ui/avatar`. The default matches Figma: 40px circle, `bg-light`, `text-sidebar`, and `text-label`. `size` accepts a positive pixel diameter; invalid values fall back to 40. Typography scales from the semantic label tokens for other sizes. Use `className` for surrounding layout or semantic color overrides; native span props, refs, and `style` are supported.

```tsx
import { Avatar } from "@/components/ui/avatar";

// Meaningful standalone identity: provide a nonempty name.
<Avatar initials="JD" aria-label="Jordan Davis" />
<Avatar initials="JD" size={56} aria-labelledby="avatar-name" />
<span id="avatar-name">Jordan Davis</span>

// Decorative beside the same visible identity: avoid a duplicate announcement.
<div className="flex items-center gap-ah-12">
  <Avatar initials="JD" decorative />
  <span>Jordan Davis</span>
</div>
```

`initials` accepts a string, null, or an omitted value. Whitespace is trimmed and text is normalized to NFC; a multiword name is abbreviated to its first and last initials, and a single token to its first two display units. Text is uppercased and remains bounded inside the circle. Missing/blank input displays the shared decorative `PersonIcon`. The component never infers an accessible full name from the initials or fetches user data.

`Intl.Segmenter` is feature-detected before construction and is optional. It is used only for plain ASCII letters/digits, whose boundaries match the fallback. Non-ASCII input always uses the same deterministic code-point scanner on the server and client, regardless of Segmenter availability or its Unicode version. Fixed ranges keep common combining accents, variation selectors, skin-tone modifiers, emoji tag sequences, zero-width-joiner sequences, keycaps, and regional-indicator flag pairs together. This prevents availability-dependent initials and hydration differences without adding a polyfill or dependency. The scanner is intentionally limited: it is not full Unicode grapheme segmentation, and some complex-script combining/conjunct sequences outside those fixed ranges may be shortened differently from native Segmenter. Callers needing exact script-specific initials should supply those initials explicitly.

Accessibility follows Shared Icons: unnamed avatars are decorative (`aria-hidden="true"`). A nonempty `aria-label` or `aria-labelledby` exposes `role="img"`; initials/fallback graphics do not add a second announcement. `decorative={false}` requires one naming attribute in TypeScript; `decorative={true}` forbids them. Blank accessible names fall back to decorative at runtime. For an avatar inside a profile button, label the real button and keep the avatar decorative. The component itself is not a control or Tab stop.

Avatar works in Server and Client Components without a client directive or browser dependencies. PageHeader and Sidebar owners supply identity/accessibility props. The interactive preview is `/test/task-1/avatar`. No layout/authentication integration is performed by this component.

Run the compatibility regression checks with `node --test tests/unit/avatar-compatibility.test.mjs`. They use Node's built-in test runner, the installed TypeScript transpiler, and isolated in-memory modules; no test framework or emitted files are required. Checks cover native, absent/noncallable Segmenter, an absent Intl global, Unicode output consistency, and loading/rendering Avatar, PageHeader, and Sidebar.
