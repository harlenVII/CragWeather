"use client";

import { useEffect, useState } from "react";

export function FetchedAt({ iso }: { iso: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(
      new Date(iso).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }),
    );
  }, [iso]);

  if (!text) return null;
  return <span>{text}</span>;
}
