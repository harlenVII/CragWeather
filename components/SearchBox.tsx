"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const MP_URL_RE = /mountainproject\.com\/route\/(\d+)/;

type Result = { id: number; slug: string; name: string; areaPath: string | null; grade: string | null };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    const match = MP_URL_RE.exec(q);
    if (match) {
      router.push(`/route/${match[1]}`);
      return;
    }
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
  }, [q, router]);

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
              <Link href={`/route/${r.id}`}>
                <span className="result-name">{r.name}</span>
                {(r.grade || r.areaPath) && (
                  <span className="result-meta">
                    {[r.grade, r.areaPath].filter(Boolean).join(" · ")}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
