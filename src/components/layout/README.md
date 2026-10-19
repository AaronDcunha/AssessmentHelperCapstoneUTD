# Shared layout components

## Account dropdown

The application shell supplies `AccountDropdown` to PageHeader's optional `accountControl` slot when a signed-in header user has no explicit custom action. It reuses Avatar and Button and shows the user's name plus Log out. The shell calls Auth.js `signOut({ redirectTo: "/login" })`; pages do not implement their own account menu. The dropdown supports outside-click/Escape dismissal, keyboard focus, pending state, and logout errors. Explicit `user.action` behavior remains available for other header uses.

## Application shell

`src/app/(main)/layout.tsx` now renders `AppShell`, composing the sidebar on the left and the page header above centered main content. Small screens have a navigation toggle. Pages supply only their content.

The shared layout supplies the existing public Faculty preview destinations, including the read-only `/observations/history` page. No production permission names or role grants are inferred. At auth integration, retain the server layout's `requireUser()` check and supply server-authorized destinations. Supply safe identity through `user` (sidebar) and `headerUser` (header), and a real `notificationAction` when available. The dashboard's screenshot semester is display-only preview content; no sample identity or fake action is injected. Restricted pages and APIs must enforce access independently. Faculty page metadata opts into the shared Figma spacing/control presentation; component preview pages keep the default shell layout.

The longest matching navigation destination determines the active link and default header title. Pass `pageHeaders` with exact pathname keys to override page titles/subtitles, and `subtitle` for shared cycle context. Header callbacks must come from a Client Component; the server layout can pass serializable link actions. The global header replaces the old empty 80px placeholder.

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

Keyboard focus uses the existing global 2px outline with the contrasting `light` token. Working links retain native Tab, Enter, modified-click, and context-menu behavior. There is no disabled variant in the Figma master. `UnavailableNavigationItem` remains available for explicit no-route states; History now uses a working `NavigationItem` after the user authorized its read-only page. Denied destinations remain omitted; neither component grants authorization.

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

## PageHeader

Import `PageHeader`, `PageHeaderProps`, and `PageHeaderAction` from `@/components/layout/page-header`.

```tsx
<PageHeader
  title="AC Dashboard"
  subtitle="Fall 2026"
  notificationAction={{ label: "Open notifications", href: "/notifications" }}
  user={{ initials: "JD", name: "Jordan Davis", action: {
    label: "Open account for Jordan Davis", onClick: onOpenAccount,
  } }}
/>
```

`title` is required and uses AH Title typography. `subtitle` is optional and uses muted AH Body text; null, empty, and whitespace-only values omit its element. Pass a semester label as `subtitle`. `headingLevel` defaults to `1` and supports 1-6 independently of the visual style. Native header props, refs, styles, and `className` are forwarded.

`notificationAction` is optional; omit it to omit the Bell control. An action requires a nonempty accessible `label` and exactly one of `href` (Next.js Link destination) or `onClick` (native button handler). Callbacks must be passed from a Client Component. The component creates real non-submitting buttons for callbacks and Next.js Links for destinations. Actions also accept `aria-controls`, `aria-expanded`, and `aria-haspopup` for parent-owned menus/dialogs; the parent must supply the matching UI and state. It does not fetch notifications, infer destinations, display unread counts, or create account/authentication behavior.

`user` is optional; omit it to omit the Avatar. Supply `user.name` as the accessible full name and optional `user.initials`; missing initials reuse Avatar's Person icon fallback. Without `user.action`, Avatar is a named standalone image. With an action, provide a full action label including identity (for example, "Open account for Jordan Davis"); the inner Avatar is decorative so its initials/name are not announced twice. Bell is always decorative inside its named control. All action controls preserve the existing visible global keyboard focus outline. There is no inert Bell or fake account action when configuration is omitted.

The Figma reference `3:126` is 1096x80px and resizes to its content width. PageHeader uses full available width and an 80px minimum height with no added card background, border, shadow, or padding. Desktop content aligns at the top: title 36/50px at weight 700, subtitle 16/22px, and a 48px action row holding the shared 24px Bell and 40px Avatar. Its 24px visual gap and 12px trailing space reproduce the master's 100px action region when both controls are present. The Bell hit area is 24px and the account hit area is 40px, preserving the master geometry. Colors, spacing, and control corner radii use existing semantic tokens.

At viewports below Tailwind's `sm` breakpoint, controls move below the title and align right. Long titles/subtitles wrap at any word length and increase the header height; neither text nor focus outlines are clipped. The breakpoint and wrapping are implementation choices, since Figma supplies a desktop reference only. Omitting either action removes its occupied space; omitting both removes the action row.

The component has no hooks or client directive, so static/navigational usage works in Server Components and callback usage is composed from Client Components. The preview `/test/task-1/page-header` contains sample identities and behavior only. When integrating the shared layout, replace its reserved header slot rather than adding a second header, supply the authenticated identity and agreed notification/account behavior, and coordinate the page title/heading hierarchy with screen owners. That layout/authentication integration is not performed here.

## Sidebar and navigation configuration

Import `Sidebar` / `SidebarProps` from `@/components/layout/sidebar`. The central `navigation-config.ts` exports `navigationDefinitions`, `createNavigationConfig`, `filterNavigation`, `navigationIcons`, and the navigation data/binding/authorization types.

The definitions list all 16 Figma destinations, their labels/icons, and the Faculty, Assessment Committee, and Admin sections. IDs such as `faculty.dashboard` identify UI entries, not permissions or paths. `createNavigationConfig(bindings)` accepts a map from these IDs to `{ href, permission? }` or `{ unavailableReason, permission? }`. An explicitly unavailable entry uses `UnavailableNavigationItem`, a keyboard-focusable disabled link with an accessible explanation and no URL. It is filtered by the same authorization contract as working destinations; it does not grant access. History is bound to its implemented `/observations/history` route. Entries without either binding are omitted and empty sections removed. There are no guessed production permission values.

Sidebar requires one of two authorization contracts:

- `sections` plus a required `canAccess(item, section)` predicate. Only a strict `true` includes a destination. The predicate may consult effective permissions, ownership/scope information, or another agreed rule; Sidebar never evaluates assigned roles or invents permission inheritance. A binding's optional `permission` field is inert until the caller uses it in the predicate.
- `authorizedSections`, explicitly asserting that the caller already filtered the data. No predicate is required in this mode. A trusted server query/adapter can prepare this configuration. It must never be constructed from untrusted role labels.

Both modes remove empty categories, including their headings, panels, and separators. Denied destinations are absent from the DOM even inside collapsed panels. Raw `sections` without a predicate are rejected by TypeScript and fail closed at runtime. Filtering does not mutate the caller's configuration. Icon keys are serializable strings, so a server can pass prefiltered configuration across the client boundary without passing React component functions.

```tsx
"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import type { NavigationSection } from "@/components/layout/navigation-config";

export function AuthorizedSidebarExample({ sections }: { sections: NavigationSection[] }) {
  // sections must already come from the application's authorized navigation adapter.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ faculty: true });
  return <Sidebar authorizedSections={sections} expandedSections={expanded}
    onExpandedChange={(id, next) => setExpanded((current) => ({ ...current, [id]: next }))}
    user={{ name: "Jordan Davis", initials: "JD", description: "Faculty" }} />;
}
```

`expandedSections` is controlled by section ID (missing IDs are collapsed). `onExpandedChange(id, next)` requests a change to just that section; merge it into the parent map to preserve independent state. Filtering does not reset the map, and sections may be expanded together. Each instance generates unique panel IDs for `aria-controls`, keeps authorized collapsed panels mounted with `hidden`, and restores focus to the heading if a parent collapses a panel containing keyboard focus. When permission changes remove an entire focused category/destination, the integration owner should move focus to a remaining meaningful control.

`activeItemId` is explicit: Sidebar highlights exactly the authorized destination with that ID using NavigationItem and `aria-current="page"`. There is no prefix matching, role-based dashboard redirect, automatic expansion, or inferred query/hash policy. The parent maps its current route to an item ID. Optional `onItemNavigate(item)` runs on ordinary same-origin Next.js navigation, not modified clicks opening another tab. Route synchronization and browser history remain parent responsibilities. Item IDs must be unique globally; section IDs must be unique, stable, and contain no whitespace.

`user` accepts optional `name`, `initials`, `description`, and `accessibleName`. Missing names use configurable `missingUserLabel` (default "User information unavailable"); missing initials reuse Avatar's Person fallback. Visible names/descriptions wrap. Avatar is decorative beside the visible identity. An optional `accessibleName` replaces the spoken name while preserving the visible name, so identity is announced once. Descriptions are display-only and never determine navigation access. `navigationLabel` labels the nav landmark; `emptyMessage` customizes the no-destinations message. Native aside props, refs, styles, and `className` are supported.

The visual reference is Figma `15:394`: 288px width, 16px padding/gaps, dark sidebar surface, 88px branding row with shared Book icon and AH Brand text, green separators, shared RoleHeading and NavigationItem, and a 64px identity footer with the 40px Avatar. It uses a 960px minimum reference height and grows with content; no fixed positioning, clipping, drawer, or page layout changes are introduced. The parent can override minimum height via `style` when fitting the application shell. Width shrinks to its container, labels wrap, and all content stays in normal document flow on narrow viewports. Faculty's fixed Figma list frame includes 8px of unused trailing space; rendered lists use their natural content height. No invented global colors, effects, or sizes are introduced.

Read-only branch inspection found `GET /api/me` supplies `{ id, username, name, roles, permissions }` in `origin/36-authentication-backend`; `src/server/demo-auth.ts` exposes only temporary fixture permissions `test:faculty`, `test:ac`, and `test:admin`. Its auth handoff explicitly defers final production permission definitions. Existing business route directories are placeholders. Those fixture permissions are not assigned to production Figma destinations here. Production bindings, permission-to-destination rules, route matching, authenticated identity loading, and shell/mobile-drawer integration require coordination with their owners. Server pages/APIs must independently authorize access. No authentication files or shared layout are changed.

The isolated preview `/test/task-1/sidebar` demonstrates filtered and prefiltered inputs, all three sections and combined access, individual destination filtering, independent expansion, active destination changes/navigation, missing/long identity information, and narrow layouts. All sample destinations and allow lists stay in the preview.
