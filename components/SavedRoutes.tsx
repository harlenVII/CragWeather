"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/favorites";

export function SavedRoutes() {
  const { favorites, remove } = useFavorites();

  if (favorites.length === 0) return null;

  return (
    <section className="home-popular">
      <h2>Saved routes</h2>
      <ul>
        {favorites.map((r) => (
          <li key={r.id} className="saved-card">
            <Link href={`/route/${r.id}`}>{r.name}</Link>
            <button
              className="saved-card-remove"
              onClick={() => remove(r.id)}
              aria-label={`Remove ${r.name} from saved`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
