import { CalendarIcon, ChartIcon, ClipboardIcon, DocumentIcon, GridIcon, PeopleIcon, PersonIcon, ShieldIcon } from "@/components/ui/icons";
import type { NavigationItemProps } from "./navigation-item";

/** String icon keys keep navigation data serializable across a server/client boundary. */
export const navigationIcons = {
  calendar: CalendarIcon, chart: ChartIcon, clipboard: ClipboardIcon, document: DocumentIcon,
  grid: GridIcon, people: PeopleIcon, person: PersonIcon, shield: ShieldIcon,
};
export type NavigationIconName = keyof typeof navigationIcons;

type NavigationTarget =
  | { href: NavigationItemProps["href"]; unavailableReason?: never }
  | { href?: never; unavailableReason: string };

export type NavigationDestination = {
  id: string;
  label: string;
  icon: NavigationIconName;
  /** Caller-supplied backend identifier, if agreed. It never grants access by itself. */
  permission?: string;
} & NavigationTarget;

export type NavigationSection = {
  id: string;
  label: string;
  icon: NavigationIconName;
  items: readonly NavigationDestination[];
};
export type NavigationAuthorization = (item: NavigationDestination, section: NavigationSection) => boolean;

/** Figma destination IDs identify UI entries, NOT backend permissions or URL paths. */
export const navigationDefinitions = [
  { id: "faculty", label: "Faculty", icon: "person", items: [
    { id: "faculty.dashboard", label: "Dashboard", icon: "grid" },
    { id: "faculty.evaluation", label: "My Evaluation", icon: "document" },
    { id: "faculty.requests", label: "Observer Requests", icon: "people" },
    { id: "faculty.observations", label: "Observations", icon: "clipboard" },
    { id: "faculty.history", label: "History", icon: "calendar" },
  ] },
  { id: "ac", label: "Assessment Committee", icon: "people", items: [
    { id: "ac.dashboard", label: "Dashboard", icon: "grid" },
    { id: "ac.cycles", label: "Evaluation Cycles", icon: "calendar" },
    { id: "ac.faculty", label: "Faculty Due / Overdue", icon: "people" },
    { id: "ac.progress", label: "Observation Progress", icon: "clipboard" },
    { id: "ac.template", label: "Observation Template", icon: "document" },
    { id: "ac.reports", label: "Reports / KPIs", icon: "chart" },
    { id: "ac.semester", label: "Semester Settings", icon: "calendar" },
  ] },
  { id: "admin", label: "Admin", icon: "shield", items: [
    { id: "admin.dashboard", label: "Dashboard", icon: "grid" },
    { id: "admin.users", label: "Users", icon: "people" },
    { id: "admin.roles", label: "Roles & Permissions", icon: "shield" },
    { id: "admin.hiring", label: "Hiring Levels", icon: "chart" },
  ] },
] as const;

export type NavigationDestinationId = typeof navigationDefinitions[number]["items"][number]["id"];
export type NavigationBindings = Partial<Record<NavigationDestinationId, NavigationTarget & Pick<NavigationDestination, "permission">>>;

/** No fallback routes or production permission names: omit destinations without a binding. */
export function createNavigationConfig(bindings: NavigationBindings): NavigationSection[] {
  return navigationDefinitions.map((section) => ({
    ...section,
    items: section.items.flatMap((item): NavigationDestination[] => {
      const binding = bindings[item.id];
      return binding ? [{ ...item, ...binding }] : [];
    }),
  })).filter((section) => section.items.length > 0);
}

/** Filter destinations first, then remove empty categories. Never infer access from labels/roles. */
export function filterNavigation(sections: readonly NavigationSection[], canAccess: NavigationAuthorization): NavigationSection[] {
  return sections.map((section) => ({
    ...section, items: section.items.filter((item) => canAccess(item, section) === true),
  })).filter((section) => section.items.length > 0);
}
