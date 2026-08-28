
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
  /** Cached from route_meta so saved cards can link out without a lookup. */
  lat?: number;
  lng?: number;
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

/** MP favorites still missing cached coordinates. */
function idsNeedingCoords(routes: SavedRoute[], already: Set<number>): number[] {
  return routes
    .filter((r): r is SavedMpRoute => r.kind !== "gps" && r.lat === undefined)
    .map((r) => r.id)
    .filter((id) => !already.has(id));
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<SavedRoute[]>([]);
  const [listId, setListId] = useState<string | null>(null);
  const listIdRef = useRef<string | null>(null);
  const coordsAskedRef = useRef<Set<number>>(new Set());

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

  // Backfill coordinates for MP favorites saved before coords were stored (or joined
  // from someone else's list). Written locally only — a write-through would make every
  // device PUT the shared list on load. Ids with no route_meta row are asked for once.
  useEffect(() => {
    const ids = idsNeedingCoords(favorites, coordsAskedRef.current);
    if (ids.length === 0) return;
    ids.forEach((id) => coordsAskedRef.current.add(id));

    (async () => {
      try {
        const res = await fetch("/api/routes/coords", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) return;
        const j = (await res.json()) as { coords: { id: number; lat: number; lng: number }[] };
        if (j.coords.length === 0) return;
        const byId = new Map(j.coords.map((c) => [c.id, c]));

        setFavorites((prev) => {
          const next = prev.map((r) => {
            if (r.kind === "gps" || r.lat !== undefined) return r;
            const hit = byId.get(r.id);
            return hit ? { ...r, lat: hit.lat, lng: hit.lng } : r;
          });
          writeFavorites(next);
          return next;
        });
      } catch {
        // offline or endpoint unavailable — cards just render without a Windy link
      }
    })();
  }, [favorites]);

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
