export function DemoDataNotice({ children = "These example records are for demonstration only and are not from the database." }: { children?: string }) {
  return (
    <aside className="rounded-ah-8 border border-border bg-neutral-bg px-ah-16 py-ah-12" aria-label="Demo data notice">
      <p className="text-label text-ink">Demo data</p>
      <p className="mt-ah-4 text-caption text-muted">{children}</p>
    </aside>
  );
}
