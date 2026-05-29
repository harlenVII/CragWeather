"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { parseSearchTarget } from "@/lib/searchTarget";
import { formatCoords, coordsPath } from "@/lib/parseCoords";

type Result = { id: number; slug: string; name: string; areaPath: string | null; grade: string | null };

export function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    const target = parseSearchTarget(q);

    if (target?.kind === "mp") {
      setResults([]);
      setCoords(null);
      router.push(`/route/${target.id}`);
      return;
    }

    if (target?.kind === "coords") {
      setResults([]);
      if (target.source === "url") {
        setCoords(null);
        router.push(`/at/${coordsPath(target.lat, target.lng)}`);
      } else {
        setCoords({ lat: target.lat, lng: target.lng });
      }
      return;
    }

    setCoords(null);
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

  const showDropdown = coords !== null || results.length > 0;

  return (
    <div className="searchbox">
      <input
        type="search"
        placeholder="Search a route or paste coordinates…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search routes"
      />
      {showDropdown && (
        <ul role="listbox" className="searchbox-results">
          {coords && (
            <li key="coords">
              <Link href={`/at/${coordsPath(coords.lat, coords.lng)}`}>
                <span className="result-name">📍 Weather at {formatCoords(coords.lat, coords.lng)}</span>
              </Link>
            </li>
          )}
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
