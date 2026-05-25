"use client";

import Link from "next/link";
import { useState } from "react";
import { useFavorites } from "@/lib/favorites";
import { SyncModal } from "@/components/SyncModal";

export function SavedRoutes() {
  const { favorites, remove, listId, createSyncedList, unlink } = useFavorites();
  const [modalOpen, setModalOpen] = useState(false);
  const isEmpty = favorites.length === 0;

  return (
    <section className="home-popular">
      <h2>
        Saved routes
        {listId && <span className="saved-synced-badge"> · Synced</span>}
      </h2>
      {isEmpty ? (
        <p className="saved-empty">
          No routes saved yet. Open a route and tap &ldquo;Save route&rdquo; to add it here.
        </p>
      ) : (
        <ul>
          {favorites.map((r) => (
            <li key={r.id} className="saved-card">
              <Link href={`/route/${r.id}`} className="saved-card-link">
                <span className="saved-card-name">{r.name}</span>
                {r.grade && <span className="saved-card-grade">{r.grade}</span>}
                {r.area && <span className="saved-card-area">{r.area}</span>}
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
      )}
      <div className="saved-sync-actions">
        <button onClick={() => setModalOpen(true)}>
          {listId ? "Synced — show QR" : "Sync to another device"}
        </button>
      </div>
      <SyncModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        listId={listId}
        createSyncedList={createSyncedList}
        unlink={unlink}
      />
    </section>
  );
}
