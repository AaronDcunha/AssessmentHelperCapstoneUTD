"use client";

import { useState } from "react";
import { PageHeader, type PageHeaderAction } from "@/components/layout/page-header";
import { Input, Select } from "@/components/ui/form-fields";
import { Section } from "@/components/ui/section";

export default function PageHeaderPreviewPage() {
  const [notificationActivations, setNotificationActivations] = useState(0);
  const [accountActivations, setAccountActivations] = useState(0);
  const [title, setTitle] = useState("Faculty observation scheduling and assessment participation overview");
  const [subtitle, setSubtitle] = useState("Fall 2026");
  const [initials, setInitials] = useState("MR");
  const [name, setName] = useState("Morgan Reed");
  const [notificationMode, setNotificationMode] = useState("callback");
  const [accountMode, setAccountMode] = useState("action");

  const notificationAction: PageHeaderAction = {
    label: "Preview notifications",
    onClick: () => setNotificationActivations((count) => count + 1),
  };
  const accountAction: PageHeaderAction = {
    label: `Preview account for ${name || "sample user"}`,
    onClick: () => setAccountActivations((count) => count + 1),
  };

  return (
    <div className="space-y-ah-24">
      <PageHeader
        title="AC Dashboard" subtitle="Fall 2026"
        notificationAction={notificationAction}
        user={{ initials: "JD", name: "Jordan Davis", action: { label: "Preview account for Jordan Davis", onClick: () => setAccountActivations((count) => count + 1) } }}
        data-header-example="reference"
      />
      <p role="status" aria-atomic="true" className="text-body text-muted" data-example="activity">
        Notification callback activations: {notificationActivations}. Account callback activations: {accountActivations}. Local preview only; no notifications are fetched or sent.
      </p>

      <Section title="Faculty and Admin examples" description="These headers reuse the same master with page-specific titles. Missing subtitle, optional controls, named standalone avatars, and destination links are demonstrated below.">
        <div className="space-y-ah-32">
          <PageHeader title="Faculty Dashboard" subtitle="Fall 2026" headingLevel={3}
            notificationAction={{ label: "Go to sample notifications", href: "/test/task-1/page-header#notification-destination" }}
            user={{ initials: "AL", name: "Alexandra Lee" }} data-header-example="faculty" />
          <PageHeader title="Admin Dashboard" headingLevel={3}
            user={{ initials: "PK", name: "Priya Kumar", action: { label: "Open Avatar preview for Priya Kumar", href: "/test/task-1/avatar" } }}
            data-header-example="admin" />
          <PageHeader title="Users" subtitle="   " headingLevel={3} data-header-example="no-actions" />
          <PageHeader title="Observation History" subtitle="Fall 2026" headingLevel={3}
            user={{ name: "Taylor Smith" }} data-header-example="missing-initials" />
        </div>
      </Section>

      <Section title="Interactive and long-title example" description="Edit the title, optional subtitle, and sample identity. Choose a notification callback, destination, or no action; show the avatar as an account button, a named image, or omit it.">
        <div className="mb-ah-24 grid grid-cols-1 gap-ah-16 sm:grid-cols-2">
          <Input label="Page title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Input label="Subtitle or semester" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} hint="Clear this field to omit the subtitle." />
          <Input label="Current-user initials" value={initials} onChange={(event) => setInitials(event.target.value)} hint="Blank initials display the shared Person icon." />
          <Input label="Current-user accessible name" value={name} onChange={(event) => setName(event.target.value)} />
          <Select label="Notification action" value={notificationMode} onChange={(event) => setNotificationMode(event.target.value)}>
            <option value="callback">Callback</option><option value="link">Destination link</option><option value="none">Omit notifications</option>
          </Select>
          <Select label="Avatar and account action" value={accountMode} onChange={(event) => setAccountMode(event.target.value)}>
            <option value="action">Account callback</option><option value="image">Named avatar only</option><option value="none">Omit avatar</option>
          </Select>
        </div>
        <PageHeader
          title={title || "Untitled preview page"} subtitle={subtitle} headingLevel={3}
          notificationAction={notificationMode === "none" ? undefined : notificationMode === "link" ? { label: "Go to sample notifications", href: "/test/task-1/page-header#notification-destination" } : notificationAction}
          user={accountMode === "none" ? undefined : { initials, name: name || "Sample user", action: accountMode === "action" ? accountAction : undefined }}
          data-header-example="interactive"
        />
      </Section>

      <Section id="notification-destination" title="Sample notification destination" description="Notification links arrive here. The component delegates all notification behavior to its parent.">
        <p className="text-body text-ink">No unread counts, API calls, notification menu, or authentication behavior are implemented by this preview.</p>
      </Section>
    </div>
  );
}
