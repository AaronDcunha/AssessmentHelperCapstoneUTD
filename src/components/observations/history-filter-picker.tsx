"use client";

import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DownIcon } from "@/components/ui/icons";
import styles from "./observation-history.module.css";

/** A nonmodal picker: native buttons support Tab/Space/Enter, Escape restores
 * trigger focus, and clicking/focusing outside closes without stealing focus.
 */
export function HistoryFilterPicker({
  label,
  name,
  disabled,
  active,
  children,
}: {
  label: string;
  name: string;
  disabled: boolean;
  active: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  useLayoutEffect(() => {
    if (!open) return;
    function positionPanel() {
      const rect = root.current?.getBoundingClientRect();
      const popup = panel.current;
      if (!rect || !popup) return;
      const width = Math.min(340, window.innerWidth - 32);
      popup.style.width = `${width}px`;
      popup.style.left = `${Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16))}px`;
      const height = Math.min(popup.scrollHeight, window.innerHeight - 32);
      const below = rect.bottom + 10;
      const top =
        below + height <= window.innerHeight - 16
          ? below
          : rect.top - height - 10 >= 16
            ? rect.top - height - 10
            : Math.max(16, window.innerHeight - height - 16);
      popup.style.top = `${top}px`;
      popup.style.transformOrigin = top < rect.top ? "bottom right" : "top right";
    }
    positionPanel();
    window.addEventListener("resize", positionPanel);
    return () => window.removeEventListener("resize", positionPanel);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    panel.current
      ?.querySelector<HTMLButtonElement>("button[aria-pressed='true'], button:not(:disabled)")
      ?.focus();
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  function close() {
    setOpen(false);
    document.getElementById(`${id}-trigger`)?.focus();
  }
  return (
    <div
      ref={root}
      className={styles.picker}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      onBlur={(event) => {
        if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node))
          setOpen(false);
      }}
    >
      <Button
        id={`${id}-trigger`}
        data-history-motion="picker"
        variant="secondary"
        disabled={disabled}
        className={`${styles.pickerTrigger} ${active ? styles.pickerActive : ""}`}
        aria-label={name}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {label}
        <DownIcon size={16} />
      </Button>
      {open && (
        <div
          ref={panel}
          role="dialog"
          tabIndex={-1}
          aria-label={name}
          id={id}
          className={styles.pickerPanel}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}
