"use client";

import Link from "next/link";
import { useState } from "react";
import { useFavorites } from "@/lib/favorites";
import { SyncModal } from "@/components/SyncModal";

export function SavedRoutes() {
  const { favorites, remove, listId } = useFavorites();
  const [modalOpen, setModalOpen] = useState(false);

  if (favorites.length === 0) return null;

  return (
    <section className="home-popular">
      <h2>
        Saved routes
        {listId && <span className="saved-synced-badge"> · Synced</span>}
      </h2>
      <ul>
        {favorites.map((r) => (
          <li key={r.id} className="saved-card">
            <Link href={`/route/${r.id}`} className="saved-card-link">
              <span className="saved-card-name">{r.name}</span>
              {(r.area || r.grade) && (
                <span className="saved-card-meta">
                  {r.area && <span className="saved-card-area">{r.area}</span>}
                  {r.area && r.grade && <span className="saved-card-sep"> · </span>}
                  {r.grade && <span className="saved-card-grade">{r.grade}</span>}
                </span>
              )}
            </Link>
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
      <div className="saved-sync-actions">
        <button onClick={() => setModalOpen(true)}>
          {listId ? "Synced — show QR" : "Sync to another device"}
        </button>
      </div>
      <SyncModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </section>
  );
}
