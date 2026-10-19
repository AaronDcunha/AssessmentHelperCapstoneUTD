import { ButtonLink } from "@/components/ui/button";
import { facultyRoutes } from "@/components/observations/faculty-routes";

export default function FacultyDashboardPage() {
  return (
    <div className="space-y-ah-24">
      <section
        aria-label="Dashboard status"
        className="grid grid-cols-1 gap-ah-16 md:grid-cols-3"
      >
        <article className="flex min-h-[148px] flex-col justify-center gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24">
          <p className="text-body text-muted">Evaluation status</p>
          <p className="text-metric text-ink">Due</p>
        </article>

        <article className="flex min-h-[148px] flex-col justify-center gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24">
          <p className="text-body text-muted">Current observation</p>
          <p className="text-section text-ink">Confirmed</p>
        </article>

        <article className="flex min-h-[148px] flex-col justify-center gap-ah-8 rounded-ah-8 border border-border bg-surface p-ah-24">
          <p className="text-body text-muted">Observer requests</p>
          <p className="text-section text-ink">2 pending</p>
        </article>
      </section>

      <section aria-labelledby="dashboard-actions">
        <h2 id="dashboard-actions" className="mb-ah-16 text-section text-ink">
          Actions
        </h2>
        <div className="grid max-w-[992px] grid-cols-1 gap-ah-16 md:grid-cols-3">
          <ButtonLink href={facultyRoutes.signup} variant="secondary" fullWidth className="h-11 py-ah-8 text-sidebar">
            Sign Up for Observation
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
          <p className="text-body text-ink">
            Your evaluation is due this semester.
          </p>
          <p className="text-body text-ink">
            Two observer requests are awaiting a response.
          </p>
        </div>
      </section>
    </div>
  );
}
