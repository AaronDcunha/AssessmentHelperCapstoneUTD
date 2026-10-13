import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Test Page | Assessment Helper",
};

// TODO(login): Use redirectTo: "/test" as the temporary login destination.
// Authentication is not implemented yet; visiting this route does not prove login.
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
