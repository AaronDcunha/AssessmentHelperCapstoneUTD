"use client";

import { useEffect, useState } from "react";

export function useApiResource<T>(loader: () => Promise<T>, fallback: T, errorFallback: T = fallback) {
  const [result, setResult] = useState<{ loader: () => Promise<T>; data: T; error: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    loader().then((value) => {
      if (!active) return;
      setResult({ loader, data: value, error: null });
    })
      .catch((reason: unknown) => {
        if (!active) return;
        setResult({ loader, data: errorFallback, error: reason instanceof Error ? reason.message : "The request failed." });
      });
    return () => { active = false; };
  }, [errorFallback, fallback, loader]);

  const current = result?.loader === loader ? result : null;
  return { data: current?.data ?? fallback, loading: current === null, error: current?.error ?? null };
}
