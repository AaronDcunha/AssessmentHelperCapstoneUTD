"use client";

import { useEffect, useState } from "react";

export function useApiResource<T>(loader: () => Promise<T>, fallback: T) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loader().then((value) => {
      if (!active) return;
      setData(value);
      setError(null);
    })
      .catch((reason: unknown) => {
        if (!active) return;
        setData(fallback);
        setError(reason instanceof Error ? reason.message : "The request failed.");
      }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fallback, loader]);

  return { data, loading, error };
}
