"use client";

import { useState } from "react";
import { ProposedDateSelector, type ProposedMeetingOption } from "@/components/observations/proposed-date-selector";
import { Input } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

const meetings: ProposedMeetingOption[] = [
  { date: "2026-11-04", meetingTime: "10:00–11:15 AM · Scheduled class meeting" },
  { date: "2026-11-11", meetingTime: "10:00–11:15 AM · Scheduled class meeting" },
  { date: "2026-11-18", meetingTime: "10:00–11:15 AM · Scheduled class meeting" },
  { date: "2026-11-25", meetingTime: "10:00–11:15 AM · Scheduled class meeting" },
  { date: "2026-11-27", meetingTime: "10:00–11:15 AM · Unavailable meeting", disabled: true },
  { date: "2026-12-02", meetingTime: "10:00–11:15 AM · Scheduled class meeting" },
];

export default function Task2PreviewPage() {
  const [selected, setSelected] = useState(["2026-11-04", "2026-11-11", "2026-11-18"]);
  const [deadline, setDeadline] = useState("2026-12-01");
  const [invalidSelection, setInvalidSelection] = useState(["2026-02-30"]);

  return (
    <div className="space-y-ah-24">
      <Section title="Proposed observation dates" description="Sample section meetings. Toggle dates or remove cards; selection and cards stay synchronized.">
        <div className="mb-ah-24 max-w-[336px]">
          <Input label="Observation deadline (exclusive)" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} hint="Dates on or after this day are disabled. Try November 18 to see stale-selection feedback." />
        </div>
        <ProposedDateSelector options={meetings} selected={selected} onChange={setSelected} observationDeadline={deadline} defaultMonth="2026-11-01" />
        <p className="mt-ah-16 text-caption text-muted">November 27 is explicitly unavailable. Other non-meeting dates and dates on/after the deadline are disabled. Person 1’s shared Calendar icon is pending.</p>
      </Section>

      <Section title="Empty availability" description="No meeting options are supplied, so every date is disabled.">
        <ProposedDateSelector options={[]} selected={[]} onChange={() => {}} observationDeadline="2026-12-01" defaultMonth="2026-11-01" />
      </Section>

      <Section title="Invalid date feedback" description="An invalid date supplied by the parent is reported and can be removed. It is never silently changed to another date.">
        <ProposedDateSelector options={meetings} selected={invalidSelection} onChange={setInvalidSelection} observationDeadline="2026-12-01" defaultMonth="2026-11-01" />
      </Section>
    </div>
  );
}
