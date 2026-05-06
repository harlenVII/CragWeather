"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Result = { id: number; slug: string; name: string };

export function SearchBox() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    if (q.trim().length === 0) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) return;
        const j = await res.json();
        setResults(j.results);
      } catch {
        // Silent; offline is OK in dropdown
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="searchbox">
      <input
        type="search"
        placeholder="Search a route…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search routes"
      />
      {results.length > 0 && (
        <ul role="listbox" className="searchbox-results">
          {results.map((r) => (
            <li key={r.id}>
              <Link href={`/route/${r.id}`}>{r.name}</Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
