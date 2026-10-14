import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Test Page | Assessment Helper",
};

// TODO(login): Use redirectTo: "/test" as the temporary login destination.
// The shared main layout now requires an authenticated session.
export default function TestPage() {
  // TODO(access): Add server permission checks when protected content is added.
  // Do not rely on navbar visibility for access.
  return (
    <>
      {/* TODO(content): Temporary empty destination for testing login redirects.
          The shared sidebar and account controls belong in (main)/layout.tsx. */}
    </>
  );
}
