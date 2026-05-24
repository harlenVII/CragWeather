"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useFavorites, type SavedRoute } from "@/lib/favorites";

export function ConfirmJoin({ listId, routes }: { listId: string; routes: SavedRoute[] }) {
  const router = useRouter();
  const { link } = useFavorites();
  const [localCount, setLocalCount] = useState(0);
  const [existingListId, setExistingListId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cw_favorites");
      const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
      setLocalCount(Array.isArray(arr) ? arr.length : 0);
    } catch {
      setLocalCount(0);
    }
    setExistingListId(localStorage.getItem("cw_list_id"));
  }, []);

  const willReplace = localCount > 0 && existingListId !== listId;
  const isSwitching = existingListId !== null && existingListId !== listId;

  function handleLink() {
    link(listId, routes);
    router.push("/");
  }

  function handleCancel() {
    router.push("/");
  }

  return (
    <main className="confirm-join">
      <h1>Join shared list</h1>
      <p>This shared list has <strong>{routes.length} routes</strong>.</p>
      <ul className="confirm-join__preview">
        {routes.slice(0, 5).map((r) => (
          <li key={r.id}>
            {r.name}
            {r.area && <span> · {r.area}</span>}
            {r.grade && <span> · {r.grade}</span>}
          </li>
        ))}
        {routes.length > 5 && <li>…and {routes.length - 5} more</li>}
      </ul>

      {isSwitching && (
        <p className="confirm-join__warn">
          This device is already synced to a different list — joining will switch to this one.
        </p>
      )}
      {willReplace && !isSwitching && (
        <p className="confirm-join__warn">
          {localCount} local route{localCount === 1 ? "" : "s"} will be replaced by this shared list.
        </p>
      )}

      <div className="confirm-join__actions">
        <button onClick={handleLink} className="confirm-join__primary">
          Link this device
        </button>
        <button onClick={handleCancel}>Cancel</button>
      </div>
    </main>
  );
}
