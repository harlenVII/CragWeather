
import { useCallback, useEffect, useRef, useState } from "react";

const FAV_KEY = "cw_favorites";
const LIST_ID_KEY = "cw_list_id";
const MAX = 50;

export type SavedRoute = {
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};

function readFavorites(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedRoute[];
  } catch {
    localStorage.setItem(FAV_KEY, "[]");
    return [];
  }
}

function writeFavorites(routes: SavedRoute[]) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(routes));
  } catch {
    // quota exceeded — silently ignore
  }
}

function readListId(): string | null {
  try {
    return localStorage.getItem(LIST_ID_KEY);
  } catch {
    return null;
  }
}

async function putRemote(listId: string, routes: SavedRoute[]) {
  try {
    await fetch(`/api/list/${listId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routes }),
    });
  } catch {
    // network errors are tolerated — local write already succeeded
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedRoute[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const listIdRef = useRef<string | null>(null);

  useEffect(() => {
    const id = readListId();
    listIdRef.current = id;
    setListId(id);
    setFavorites(readFavorites());

    if (id) {
      (async () => {
        try {
          const res = await fetch(`/api/list/${id}`);
          if (!res.ok) return;
          const j = (await res.json()) as { routes: SavedRoute[] };
          setFavorites(j.routes);
          writeFavorites(j.routes);
        } catch {
          // keep local cache
        }
      })();
    }
  }, []);

  const isSaved = useCallback(
    (id: number) => favorites.some((r) => r.id === id),
    [favorites],
  );

  const writeAndSync = useCallback((next: SavedRoute[]) => {
    writeFavorites(next);
    const id = listIdRef.current;
    if (id) void putRemote(id, next);
  }, []);

  const toggle = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const exists = prev.some((r) => r.id === route.id);
      const next = exists
        ? prev.filter((r) => r.id !== route.id)
        : [route, ...prev].slice(0, MAX);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);

  const remove = useCallback((id: number) => {
    setFavorites((prev) => {
      const next = prev.filter((r) => r.id !== id);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);

  const createSyncedList = useCallback(async (): Promise<string | null> => {
    const current = readFavorites();
    try {
      const res = await fetch("/api/list", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ routes: current }),
      });
      if (!res.ok) return null;
      const j = (await res.json()) as { id: string };
      localStorage.setItem(LIST_ID_KEY, j.id);
      listIdRef.current = j.id;
      setListId(j.id);
      return j.id;
    } catch {
      return null;
    }
  }, []);

  const link = useCallback((id: string, routes: SavedRoute[]) => {
    localStorage.setItem(LIST_ID_KEY, id);
    listIdRef.current = id;
    setListId(id);
    writeFavorites(routes);
    setFavorites(routes);
  }, []);

  const unlink = useCallback(() => {
    localStorage.removeItem(LIST_ID_KEY);
    listIdRef.current = null;
    setListId(null);
  }, []);

  return { favorites, isSaved, toggle, remove, listId, createSyncedList, link, unlink };
}
