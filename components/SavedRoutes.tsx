"use client";

import Link from "next/link";
import { useState } from "react";
import { useFavorites, routeKey, type SavedRoute } from "@/lib/favorites";
import { formatCoords, coordsPath } from "@/lib/parseCoords";
import { SyncModal } from "@/components/SyncModal";

function savedHref(r: SavedRoute): string {
  return r.kind === "gps" ? `/at/${coordsPath(r.lat, r.lng)}` : `/route/${r.id}`;
}

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
            <li key={routeKey(r)} className="saved-card">
              <Link href={savedHref(r)} className="saved-card-link">
                <span className="saved-card-name">{r.name}</span>
                {r.kind === "gps" ? (
                  <span className="saved-card-area">{formatCoords(r.lat, r.lng)}</span>
                ) : (
                  <>
                    {r.grade && <span className="saved-card-grade">{r.grade}</span>}
                    {r.area && <span className="saved-card-area">{r.area}</span>}
                  </>
                )}
              </Link>
              <button
                className="saved-card-remove"
                onClick={() => remove(r)}
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
