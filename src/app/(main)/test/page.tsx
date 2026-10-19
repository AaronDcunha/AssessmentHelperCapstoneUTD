import type { Metadata } from "next";
import { ComponentDemo } from "./component-demo";

export const metadata: Metadata = {
  title: "Test Page | Assessment Helper",
};

// Component previews are linked from Admin navigation.
// The shared main layout now requires an authenticated session.
export default function TestPage() {
  // The test layout enforces Admin access for every component preview.
  return <ComponentDemo />;
}
