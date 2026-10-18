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
