import { ButtonLink } from "@/components/ui/button";
import { facultyRoutes } from "@/components/observations/faculty-routes";
import { requirePermission } from "@/server/permissions";
import { DashboardForbidden, getFacultyDashboard, type FacultyDashboard } from "@/server/queries/faculty-dashboard";
import { redirect } from "next/navigation";
import { FacultyCycleSelector } from "@/components/observations/faculty-cycle-selector";
import Link from "next/link";
import { activityPreview } from "@/lib/activity-preview";
import { evaluationProgressLabel } from "@/lib/evaluation-progress-label";

export const dynamic = "force-dynamic";

export default async function FacultyDashboardPage() {
  const user = await requirePermission("profile.read.own");
  let dashboard: FacultyDashboard | null = null;
  try {
    dashboard = await getFacultyDashboard(user);
  } catch (error) {
    if (error instanceof DashboardForbidden) redirect("/forbidden");
    // A read failure is unavailable data, never a fabricated zero or empty history.
  }
  const observation = dashboard?.currentObservation;
  const lastEvaluation = dashboard?.evaluation.lastCompletedEvaluation;
  const evaluationLabel = evaluationProgressLabel(dashboard?.evaluation.status, dashboard?.hasCurrentSignup === true, dashboard?.cycle?.semesterId, lastEvaluation?.semesterId);
  const observationLabel = !dashboard || !dashboard.access.observations || dashboard.pendingObserverRequestCount === null ? "Unavailable"
    : observation ? observation.status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "No current observation";

  return (
    <div className="space-y-ah-24">
      <FacultyCycleSelector dashboard={dashboard} />
      <section
        aria-label="Dashboard status"
        className="grid grid-cols-1 gap-ah-16 md:grid-cols-3"
      >
        <article className="flex min-h-[148px] flex-col justify-start gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24">
          <p className="text-body text-muted">Evaluation status</p>
          <p className="text-section text-ink" title={evaluationLabel === "Signed up" ? "Signup recorded; observation and assessment completion are still pending." : dashboard?.evaluation.reason}>
            {dashboard?.access.evaluation ? evaluationLabel : "Unavailable"}
          </p>
          <p className="text-caption text-muted">
            Last completed: {lastEvaluation?.semester ?? (dashboard?.access.evaluation ? "None recorded" : "Unavailable")}
          </p>
          {dashboard?.evaluation.status === "unknown" && <p className="text-caption text-muted">{dashboard.evaluation.reason}</p>}
        </article>

        <article className="flex min-h-[148px] flex-col justify-start gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24">
          <p className="text-body text-muted">Current observation</p>
          <p className="text-section text-ink">{observationLabel}</p>
          {dashboard?.cycleReason && <p className="text-caption text-muted">{dashboard.cycleReason}</p>}
          {observation && <p className="text-caption text-muted">{observation.course}.{observation.section} · {observation.participation === "observee" ? "As Observee" : "As Observer"}</p>}
          {observation?.scheduledAt && <time dateTime={observation.scheduledAt} className="text-caption text-muted">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: dashboard?.cycle?.timeZone ?? "America/Chicago" }).format(new Date(observation.scheduledAt))}</time>}
        </article>

        <article className="flex min-h-[148px] flex-col justify-start gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24">
          <p className="text-body text-muted">Observer requests</p>
          <p className="text-section text-ink">
            {dashboard?.pendingObserverRequestCount != null ? `${dashboard.pendingObserverRequestCount} pending` : "Unavailable"}
          </p>
        </article>
      </section>

      <section aria-labelledby="dashboard-actions">
        <h2 id="dashboard-actions" className="mb-ah-16 text-section text-ink">
          Actions
        </h2>
        <div className="grid max-w-[992px] grid-cols-1 gap-ah-16 md:grid-cols-3">
          <ButtonLink href={dashboard?.hasCurrentSignup ? facultyRoutes.details : facultyRoutes.signup} variant="secondary" fullWidth className="h-11 py-ah-8 text-sidebar">
            {dashboard?.hasCurrentSignup ? "View Observation Details" : "Sign Up for Observation"}
          </ButtonLink>
          <ButtonLink href={facultyRoutes.details} variant="secondary" fullWidth className="h-11 py-ah-8 text-sidebar">
            View Current Observation
          </ButtonLink>
          <ButtonLink href={facultyRoutes.requests} variant="primary" fullWidth className="h-11 py-ah-8">
            View Observer Requests
          </ButtonLink>
        </div>
      </section>

      <section aria-labelledby="recent-activity">
        <h2 id="recent-activity" className="mb-ah-16 text-section text-ink">
          Recent activity
        </h2>
        <div className="space-y-ah-16 rounded-ah-8 border border-border bg-surface p-ah-24">
          {!dashboard ? <p className="text-body text-muted" role="status">Dashboard data is temporarily unavailable. Please try again later.</p>
            : !dashboard.access.activity ? <p className="text-body text-muted">Recent activity is not available with your current permissions.</p>
            : dashboard.recentActivity.length === 0 ? <p className="text-body text-muted">No recent activity.</p>
            : dashboard.recentActivity.map((activity) => <article key={activity.id} className="space-y-ah-4">
              <p className="break-words text-label text-ink">{activity.title}</p>
              <p className="line-clamp-2 break-words text-body text-ink">{activityPreview(activity.message)}</p>
              <Link className="block text-caption text-sidebar underline" href="/notifications">View full message in Notifications</Link>
              <time dateTime={activity.createdAt} className="text-caption text-muted">
                {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/Chicago" }).format(new Date(activity.createdAt))}
              </time>
            </article>)}
        </div>
      </section>
    </div>
  );
}
