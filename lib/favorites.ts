
import { useCallback, useEffect, useRef, useState } from "react";
import { coordsPath } from "./parseCoords";

const FAV_KEY = "cw_favorites";
const LIST_ID_KEY = "cw_list_id";
const MAX = 50;

export type SavedMpRoute = {
  kind?: "mp";
  id: number;
  name: string;
  area: string | null;
  grade: string | null;
};
export type SavedGpsRoute = {
  kind: "gps";
  lat: number;
  lng: number;
  name: string;
};
export type SavedRoute = SavedMpRoute | SavedGpsRoute;

/** Stable identity used for dedup, removal, and React keys. */
export function routeKey(r: SavedRoute): string {
  return r.kind === "gps" ? `gps:${coordsPath(r.lat, r.lng)}` : `mp:${r.id}`;
}

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
    (route: SavedRoute) => {
      const key = routeKey(route);
      return favorites.some((r) => routeKey(r) === key);
    },
    [favorites],
  );

  const writeAndSync = useCallback((next: SavedRoute[]) => {
    writeFavorites(next);
    const id = listIdRef.current;
    if (id) void putRemote(id, next);
  }, []);

  const toggle = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const key = routeKey(route);
      const exists = prev.some((r) => routeKey(r) === key);
      const next = exists
        ? prev.filter((r) => routeKey(r) !== key)
        : [route, ...prev].slice(0, MAX);
      writeAndSync(next);
      return next;
    });
  }, [writeAndSync]);

  const remove = useCallback((route: SavedRoute) => {
    setFavorites((prev) => {
      const key = routeKey(route);
      const next = prev.filter((r) => routeKey(r) !== key);
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
