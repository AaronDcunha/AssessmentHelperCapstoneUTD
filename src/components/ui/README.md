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
