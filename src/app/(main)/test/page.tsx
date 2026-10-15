import type { Metadata } from "next";
import { ComponentDemo } from "./component-demo";

export const metadata: Metadata = {
  title: "Test Page | Assessment Helper",
};

// TODO(login): Use redirectTo: "/test" as the temporary login destination.
// The shared main layout now requires an authenticated session.
export default function TestPage() {
  // TODO(access): Add server permission checks when protected content is added.
  // Do not rely on navbar visibility for access.
  return <ComponentDemo />;
}
