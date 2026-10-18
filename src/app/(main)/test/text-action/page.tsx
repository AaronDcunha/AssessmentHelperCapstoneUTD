"use client";

import { useState } from "react";
import { Section } from "@/components/ui/section";
import { TextAction } from "@/components/ui/text-action";

export default function TextActionPreviewPage() {
  const [clicks, setClicks] = useState(0);

  return (
    <Section title="Text actions" description="Use Tab to focus an action. Press Enter to follow a link; Enter or Space activates a button.">
      <div className="flex flex-wrap items-center gap-ah-16">
        <TextAction href="/test">Review →</TextAction>
        <TextAction onClick={() => setClicks((count) => count + 1)}>Run action</TextAction>
        <TextAction disabled onClick={() => setClicks((count) => count + 1)}>Unavailable</TextAction>
        <TextAction href="/">Return to home page →</TextAction>
      </div>
      <p role="status" className="mt-ah-16 text-body text-muted">
        Action activated {clicks} {clicks === 1 ? "time" : "times"}.
      </p>
    </Section>
  );
}
