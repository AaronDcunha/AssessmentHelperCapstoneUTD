import { adminNavigationBindings, adminRoutes, createNavigationConfig, filterNavigation } from "@/components/layout/navigation-config";
import { ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { requirePermission } from "@/server/permissions";

export default async function AdminDashboardPage() {
  const user = await requirePermission("users.read");
  const destinations = filterNavigation(
    createNavigationConfig(adminNavigationBindings),
    item => !!item.permission && user.permissions.includes(item.permission),
  ).flatMap(section => section.items).filter(item => item.href !== adminRoutes.dashboard);

  return (
    <Section title="Administration" variant="plain">
      <nav aria-label="Administration" className="grid max-w-[992px] grid-cols-1 gap-ah-16 md:grid-cols-3">
        {destinations.map(item => item.href !== undefined && (
          <ButtonLink key={item.id} href={item.href}
            variant={item.id === "admin.hiring" ? "primary" : "secondary"}
            fullWidth className={`h-11 py-ah-8 ${item.id === "admin.hiring" ? "" : "text-sidebar"}`}>
            {item.label}
          </ButtonLink>
        ))}
      </nav>
    </Section>
  );
}
