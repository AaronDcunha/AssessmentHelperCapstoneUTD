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

/** Temporary Admin shortcuts for every implemented preview and role probe. */
export const adminTestPages = [
  { id: "admin.tests", label: "Component Tests", icon: "grid", href: "/test" },
  { id: "admin.authTests", label: "Authentication Tests", icon: "shield", href: "/auth-test" },
  { id: "admin.alertAcTest", label: "Alert AC Test", icon: "people", href: "/test/alert-ac" },
  { id: "admin.ratingTest", label: "Assessment Rating Test", icon: "clipboard", href: "/test/assessment-rating" },
  { id: "admin.textActionTest", label: "Text Action Test", icon: "document", href: "/test/text-action" },
  { id: "admin.iconsTest", label: "Icons Test", icon: "grid", href: "/test/task-1/icons" },
  { id: "admin.avatarTest", label: "Avatar Test", icon: "person", href: "/test/task-1/avatar" },
  { id: "admin.navigationTest", label: "Navigation Item Test", icon: "document", href: "/test/task-1/navigation-item" },
  { id: "admin.roleHeadingTest", label: "Role Heading Test", icon: "people", href: "/test/task-1/role-heading" },
  { id: "admin.sidebarTest", label: "Sidebar Test", icon: "grid", href: "/test/task-1/sidebar" },
  { id: "admin.headerTest", label: "Page Header Test", icon: "document", href: "/test/task-1/page-header" },
  { id: "admin.datesTest", label: "Proposed Dates Test", icon: "calendar", href: "/test/task-2" },
  { id: "admin.task3Test", label: "Metrics & Status Test", icon: "grid", href: "/test/task-3" },
  { id: "admin.task4Test", label: "Question Editor Test", icon: "grid", href: "/test/task-4" },
  { id: "admin.task5Test", label: "Attention Table Test", icon: "grid", href: "/test/task-5" },
  { id: "admin.facultyAccessTest", label: "Faculty Access Test", icon: "person", href: "/test/faculty" },
  { id: "admin.acAccessTest", label: "AC Access Test", icon: "people", href: "/test/ac" },
  { id: "admin.adminAccessTest", label: "Admin Access Test", icon: "shield", href: "/test/admin" },
] as const;

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
    ...adminTestPages.map(({ id, label, icon }) => ({ id, label, icon })),
    { id: "admin.dashboard", label: "Dashboard", icon: "grid" },
    { id: "admin.users", label: "Users", icon: "people" },
    { id: "admin.roles", label: "Roles & Permissions", icon: "shield" },
    { id: "admin.hiring", label: "Hiring Levels", icon: "chart" },
  ] },
] as const;

export type NavigationDestinationId = typeof navigationDefinitions[number]["items"][number]["id"];
export type NavigationBindings = Partial<Record<NavigationDestinationId, NavigationTarget & Pick<NavigationDestination, "permission">>>;

export const adminTestBindings: NavigationBindings = Object.fromEntries(
  adminTestPages.map(({ id, href }) => [id, { href, permission: "test:admin" }]),
);

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
