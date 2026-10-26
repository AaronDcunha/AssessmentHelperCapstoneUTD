// Use the same requirements for sidebar visibility and direct server page access.
export const acPermissions = {
  "ac.dashboard": ["cycles.read", "reports.read", "observations.read"],
  "ac.cycles": ["cycles.read"],
  "ac.cycleCreate": ["cycles.manage"],
  "ac.cycleEdit": ["cycles.manage"],
  "ac.faculty": ["cycles.read", "reports.read"],
  "ac.progress": ["cycles.read", "observations.read"],
  "ac.detail": ["observations.read"],
  "ac.template": ["templates.manage"],
  "ac.reports": ["cycles.read", "reports.read", "metrics.read"],
  "ac.semester": ["cycles.read", "cycles.manage"],
} as const;
export type AcPage = keyof typeof acPermissions;
export function canAccessAcPage(permissions: readonly string[], page: AcPage) {
  return acPermissions[page].every(permission => permissions.includes(permission));
}
