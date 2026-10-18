"use client";

import { useRef, useState } from "react";
import { AttentionTableRow } from "@/components/ac/attention-table-row";
import { Section } from "@/components/ui/section";
import { TableCell } from "@/components/ui/table";

const headerClasses = "h-10! py-ah-0! [&>div]:min-h-ah-24";

export default function Task5PreviewPage() {
  const [reviewed, setReviewed] = useState("No callback action activated yet.");
  const [reviews, setReviews] = useState(0);
  const callbackDetails = useRef<HTMLDivElement>(null);

  function review(faculty: string) {
    setReviewed(`Review callback activated for ${faculty}.`);
    setReviews((count) => count + 1);
    callbackDetails.current?.focus();
  }

  return (
    <div className="space-y-ah-24">
      <Section title="Needs attention" description="Sample dashboard rows. Review links navigate to the sample destinations below; Review buttons update the callback result. Tab through the actions or focus and scroll the table on narrow screens." />

      <div className="relative overflow-x-auto rounded-ah-8" role="region" aria-label="Needs attention sample table" tabIndex={0}>
        <table className="w-full min-w-[1096px] table-fixed border-collapse">
          <caption className="pb-ah-12 text-left text-caption text-muted">Faculty issues and observation progress — sample data only</caption>
          <thead>
            <tr className="border border-border">
              <TableCell variant="header" className={`${headerClasses} w-[384px]! pl-ah-24! pr-ah-0!`}>Faculty</TableCell>
              <TableCell variant="header" className={`${headerClasses} w-[288px]! px-ah-0!`}>Issue</TableCell>
              <TableCell variant="header" className={`${headerClasses} w-[210px]! px-ah-0!`}>Observation status</TableCell>
              <TableCell variant="header" className={`${headerClasses} w-[214px]! pl-ah-0! pr-ah-24!`}><span className="sr-only">Action</span></TableCell>
            </tr>
          </thead>
          <tbody>
            <AttentionTableRow id="sarah-row" faculty="Sarah Mitchell" issueStatus="overdue" observationStatus="Requests pending" action={{ href: "#review-sarah" }} />
            <AttentionTableRow id="james-row" faculty="James Lee" issueStatus="unmatched" observationStatus="Missing observer" action={{ onClick: () => review("James Lee") }} />
            <AttentionTableRow id="priya-row" faculty="Priya Raman" issueStatus="incomplete" observationStatus="Form incomplete" action={{ href: "#review-priya" }} />
            <AttentionTableRow id="daniel-row" faculty="Daniel Torres" issueStatus="incomplete" observationStatus="Awaiting form" action={{ onClick: () => review("Daniel Torres"), disabled: true }} />
            <AttentionTableRow id="missing-faculty-row" faculty={null} issueStatus="incomplete" observationStatus="Awaiting form" action={{ onClick: () => review("the record with no faculty name"), ariaLabel: "Review record with missing faculty name" }} />
            <AttentionTableRow id="missing-status-row" faculty="Alex Morgan" issueStatus={null} observationStatus=" " action={{ onClick: () => review("Alex Morgan"), label: "Open record →" }} />
            <AttentionTableRow id="missing-action-row" faculty="Taylor Davis" />
          </tbody>
        </table>
      </div>

      <Section title="Callback result" description="The disabled Daniel Torres action and the Taylor Davis row without a destination cannot activate a review.">
        <div ref={callbackDetails} tabIndex={-1} className="rounded-ah-8 p-ah-8">
          <p role="status" aria-atomic="true" className="text-body text-ink">{reviewed} Callback activations: {reviews}.</p>
        </div>
        <p className="mt-ah-12 text-caption text-muted">Dashes mean data was not provided. They do not assign an issue or observation status.</p>
      </Section>

      <Section id="review-sarah" title="Sample review: Sarah Mitchell" description="This is the local destination of Sarah’s Review link. No backend request is made.">
        <p className="text-body text-ink">Supplied issue: Overdue. Supplied observation status: Requests pending.</p>
      </Section>
      <Section id="review-priya" title="Sample review: Priya Raman" description="This is the local destination of Priya’s Review link. No backend request is made.">
        <p className="text-body text-ink">Supplied issue: Incomplete. Supplied observation status: Form incomplete.</p>
      </Section>
    </div>
  );
}
