
import { useCallback, useEffect, useState } from "react";

const KEY = "cw_favorites";
const MAX = 50;

export type SavedRoute = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};

function readStorage(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedRoute[];
  } catch {
    localStorage.setItem(KEY, "[]");
    return [];
  }
}

function writeStorage(routes: SavedRoute[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(routes));
  } catch {
    // quota exceeded — silently ignore
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedRoute[]>([]);

  useEffect(() => {
    setFavorites(readStorage());
  }, []);

  const isSaved = useCallback(
    (id: number) => favorites.some((r) => r.id === id),
    [favorites]
  );

  const toggle = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const exists = prev.some((r) => r.id === route.id);
      const next = exists
        ? prev.filter((r) => r.id !== route.id)
        : [route, ...prev].slice(0, MAX);
      writeStorage(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeStorage(next);
      return next;
    });
  }, []);

  return { favorites, isSaved, toggle, remove };
}
