"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export type AccountDropdownProps = {
  name: string;
  initials?: string | null;
  onLogout: () => Promise<unknown>;
};

/** Shared account disclosure; authentication behavior is supplied by the shell. */
export function AccountDropdown({ name, initials, onLogout }: AccountDropdownProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const logout = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    logout.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <Button ref={trigger} variant="secondary" aria-label={`Account options for ${name}`}
        aria-expanded={open} aria-controls={id}
        className="size-11 rounded-ah-pill! border-0 p-ah-0!"
        onClick={() => { setError(""); setOpen((value) => !value); }}>
        <Avatar initials={initials} decorative />
      </Button>
      <div id={id} hidden={!open}
        className="absolute right-0 top-full z-50 mt-ah-8 w-[240px] max-w-[calc(100vw-3rem)] rounded-ah-8 border border-border bg-surface p-ah-16">
        <p className="mb-ah-12 break-words text-label text-ink">{name}</p>
        <Button ref={logout} variant="secondary" fullWidth disabled={pending} aria-busy={pending}
          onClick={async () => {
            if (pending) return;
            setPending(true);
            setError("");
            try {
              await onLogout();
            } catch {
              setError("Unable to log out. Please try again.");
            } finally {
              setPending(false);
            }
          }}>
          {pending ? "Logging out…" : "Log out"}
        </Button>
        {error && <p role="alert" className="mt-ah-8 text-caption text-danger">{error}</p>}
      </div>
    </div>
  );
}
