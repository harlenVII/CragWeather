"use client";

import { useFavorites, type SavedRoute } from "@/lib/favorites";

export function SaveButton({ route }: { route: SavedRoute }) {
  const { isSaved, toggle } = useFavorites();
  const saved = isSaved(route.id);

  return (
    <button className="save-btn" onClick={() => toggle(route)}>
      {saved ? "Saved ✓" : "Save route"}
    </button>
  );
}
