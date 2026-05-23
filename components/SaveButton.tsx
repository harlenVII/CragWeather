"use client";

import { useFavorites, type SavedRoute } from "@/lib/favorites";

export function SaveButton({ route }: { route: SavedRoute }) {
  const { isSaved, toggle } = useFavorites();
  const saved = isSaved(route.id);

  return (
    <button className={`save-btn${saved ? " save-btn--saved" : ""}`} onClick={() => toggle(route)}>
      <span className="save-btn__label">{saved ? "Saved ✓" : "Save route"}</span>
      {saved && <span className="save-btn__remove-label">× Remove</span>}
    </button>
  );
}
