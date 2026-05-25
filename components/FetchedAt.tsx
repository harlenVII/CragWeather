"use client";

export function FetchedAt({ iso }: { iso: string }) {
  const t = new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
  return <span>{t}</span>;
}
