"use client";

import { Button } from "@/components/ui/button";

export default function FeedbackError({ unstable_retry }: { unstable_retry: () => void }) {
  return <div className="space-y-ah-12">
    <p role="alert" className="text-danger">Semester feedback could not be loaded.</p>
    <Button variant="secondary" onClick={unstable_retry}>Retry</Button>
  </div>;
}
