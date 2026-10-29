"use client";

import { useLayoutEffect, useRef } from "react";

type Rect = { left: number; top: number; width: number; height: number };

/** Animate only toolbar geometry; filtering and table updates stay immediate. */
export function useHistoryToolbarMotion() {
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(new Map<Element, Rect>());
  const animations = useRef(new Map<Element, Animation>());
  const viewport = useRef({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const toolbar = root.current;
    if (!toolbar) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const resized =
      viewport.current.width !== window.innerWidth ||
      viewport.current.height !== window.innerHeight;
    viewport.current = { width: window.innerWidth, height: window.innerHeight };
    const items = toolbar.querySelectorAll<HTMLElement>("[data-history-motion]");
    const next = new Map<Element, Rect>();
    for (const item of items) {
      let before = previous.current.get(item);
      const running = animations.current.get(item);
      // Continue from the current visual position when the user switches again
      // before the previous transition has finished.
      if (before && running?.playState === "running") {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(item).transform);
        before = {
          left: before.left + matrix.m41,
          top: before.top + matrix.m42,
          width: before.width * matrix.a,
          height: before.height * matrix.d,
        };
      }
      running?.cancel();
      const after = item.getBoundingClientRect();
      next.set(item, {
        left: after.left,
        top: after.top,
        width: after.width,
        height: after.height,
      });
      if (reduced || resized || !before || !after.width || !after.height) continue;
      const x = before.left - after.left;
      const y = before.top - after.top;
      const scaleX = before.width / after.width;
      if (Math.abs(x) < 0.5 && Math.abs(y) < 0.5 && Math.abs(before.width - after.width) < 0.5)
        continue;
      const animation = item.animate(
        [
          {
            transform: `translate(${x}px, ${y}px) scaleX(${scaleX})`,
            transformOrigin: "left center",
          },
          { transform: "translate(0, 0) scaleX(1)", transformOrigin: "left center" },
        ],
        { duration: 240, easing: "cubic-bezier(.22, 1, .36, 1)" },
      );
      animations.current.set(item, animation);
    }
    for (const [item, animation] of animations.current) {
      if (!next.has(item)) {
        animation.cancel();
        animations.current.delete(item);
      }
    }
    previous.current = next;
  });

  useLayoutEffect(() => {
    const toolbar = root.current;
    if (!toolbar) return;
    const indicator = toolbar.querySelector<HTMLElement>("[data-role-indicator]");
    const tabs = toolbar.querySelector<HTMLElement>("[data-role-tabs]");
    if (!indicator || !tabs) return;
    function positionIndicator() {
      const active = tabs!.querySelector<HTMLButtonElement>("button[aria-pressed='true']");
      if (!active) return;
      indicator!.style.width = `${active.offsetWidth}px`;
      indicator!.style.transform = `translateX(${active.offsetLeft}px)`;
      indicator!.style.opacity = "1";
    }
    positionIndicator();
    const observer = new ResizeObserver(positionIndicator);
    observer.observe(tabs);
    return () => observer.disconnect();
  });

  useLayoutEffect(() => {
    const activeAnimations = animations.current;
    return () => {
      for (const animation of activeAnimations.values()) animation.cancel();
    };
  }, []);

  return root;
}
