# Shared layout components

## NavigationItem

Import `NavigationItem` and `NavigationItemProps` from `@/components/layout/navigation-item`.

```tsx
import { NavigationItem } from "@/components/layout/navigation-item";
import { GridIcon } from "@/components/ui/icons";

<nav aria-label="Faculty">
  <NavigationItem label="Dashboard" href="/dashboard" icon={<GridIcon />} active />
</nav>
```

Required props are `label`, `href` (the Next.js Link string or URL object), and `icon` (a noninteractive React node, normally a shared decorative 24px icon). Native Link/anchor props, refs, styles, and `className` are forwarded. Event handlers must be supplied from a Client Component. The visible label supplies the accessible name; the icon slot is hidden from assistive technology.

`active` is explicit and defaults to `false`. It controls both Figma's active surface/orange marker and `aria-current="page"`. NavigationItem does not inspect the current URL. The screen/sidebar parent decides exact versus nested-route matching, including query/hash behavior, and passes the result; give only the current destination `active` within a navigation group. A client parent may compute this from Next.js `usePathname`, or a server parent may supply its known destination state. Permission filtering and authorization remain outside this component.

Figma master `1:134` uses a 248x44px single-line reference, 24px icons, a 12px gap/horizontal padding, AH Body text, light text, 8px corners, an active green hover surface, and a 4x28px orange active marker 8px below the top. The implementation centers the icon/text within a minimum 44px height using semantic spacing tokens. It shrinks to its container and allows long labels to wrap and increase height; no ellipsis or clipped text. The 248px width, 44px minimum height, and 28px marker are component dimensions rather than new global tokens.

Keyboard focus uses the existing global 2px outline with the contrasting `light` token. Links retain native Tab, Enter, modified-click, and context-menu behavior. There is no disabled variant in the Figma master; unavailable destinations should be omitted by the parent rather than supplying a false destination or a fake disabled anchor. This is not an authorization mechanism.

The module has no hooks or client directive and can be composed in Server and Client Components. It contains no routes, identity fetching, or permission rules. The interactive preview is `/test/task-1/navigation-item`.

## RoleHeading

Import `RoleHeading` and `RoleHeadingProps` from `@/components/layout/role-heading`. It is a controlled disclosure button; required props are `label`, `icon`, `expanded`, `onExpandedChange`, and `aria-controls` (the associated panel's ID).

```tsx
"use client";

import { useId, useState } from "react";
import { RoleHeading } from "@/components/layout/role-heading";
import { NavigationItem } from "@/components/layout/navigation-item";
import { PersonIcon, GridIcon } from "@/components/ui/icons";

export function FacultyNavigationExample() {
  const panelId = useId();
  const [expanded, setExpanded] = useState(true);
  return (
    <nav aria-label="Faculty" className="bg-sidebar">
      <RoleHeading label="Faculty" icon={<PersonIcon />} expanded={expanded}
        onExpandedChange={setExpanded} aria-controls={panelId} />
      <ul id={panelId} hidden={!expanded}>
        <li><NavigationItem label="Dashboard" href="/dashboard" icon={<GridIcon />} /></li>
      </ul>
    </nav>
  );
}
```

The label/icon are caller-supplied: Figma uses `PersonIcon` for Faculty, `PeopleIcon` for Assessment Committee, and `ShieldIcon` for Admin. No role names, permission rules, destinations, or user fetching are embedded in RoleHeading. Use noninteractive decorative icons. The visible label names the button; role icons and the shared `UpIcon`/`DownIcon` chevrons are hidden from assistive technology. Expanded uses Up; collapsed uses Down.

Each native button activation requests `onExpandedChange(!expanded)` once. It has no internal expansion state. The parent updates `expanded`, owns the associated panel and its visibility, supplies a unique panel ID, and decides whether multiple sections may be open. Keep a panel with the matching ID mounted and set `hidden={!expanded}` to remove collapsed links from layout, the accessibility tree, and Tab navigation. `aria-expanded` always reflects the supplied state, and `aria-controls` is forwarded to the button. If a parent closes a panel while focus is inside it, the parent must restore focus to its heading before hiding it.

Figma master `1:171` has a 256x64px reference, 8px padding, 12px gaps, 24px role/chevron icons, light AH Label typography (14px/20px, 500), and a 168x40px label box. At reference width, the flexible label preserves that box; shorter labels keep its top-aligned text. On narrower containers or with longer labels, text wraps without ellipsis and the button grows beyond its 64px minimum. Default background is transparent for composition on `bg-sidebar`; hover uses `bg-active` and keyboard focus uses the contrasting `light` outline. No new global tokens are introduced.

`className`, refs, native button attributes (including `disabled`), and styles are supported. The component fixes `type="button"`, derives `aria-expanded`, and owns `onClick`; use `onExpandedChange` for toggling. Enter and Space use native button behavior without extra key handlers. It is a Client Component because it wires the click callback; a client parent owns interactive state. The isolated preview is `/test/task-1/role-heading`.

Sidebar integration remains separate: provide authorized categories, state/panel IDs, routing, and any persistence of expansion state. Hiding categories is not server authorization, and this component does not enforce access.
