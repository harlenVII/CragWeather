"use client";

import { useState } from "react";
import { useFavorites, type SavedRoute } from "@/lib/favorites";
import { formatCoords } from "@/lib/parseCoords";

type SaveButtonProps =
  | { route: SavedRoute }
  | { gps: { lat: number; lng: number } };

export function SaveButton(props: SaveButtonProps) {
  if ("gps" in props) {
    return <GpsSaveButton lat={props.gps.lat} lng={props.gps.lng} />;
  }
  return <MpSaveButton route={props.route} />;
}

function MpSaveButton({ route }: { route: SavedRoute }) {
  const { isSaved, toggle } = useFavorites();
  const saved = isSaved(route);

  return (
    <button className={`save-btn${saved ? " save-btn--saved" : ""}`} onClick={() => toggle(route)}>
      <span className="save-btn__label">{saved ? "Saved ✓" : "Save route"}</span>
      {saved && <span className="save-btn__remove-label">× Remove</span>}
    </button>
  );
}

function GpsSaveButton({ lat, lng }: { lat: number; lng: number }) {
  const { isSaved, toggle } = useFavorites();
  const probe: SavedRoute = { kind: "gps", lat, lng, name: "" };
  const saved = isSaved(probe);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");

  if (saved) {
    return (
      <button className="save-btn save-btn--saved" onClick={() => toggle(probe)}>
        <span className="save-btn__label">Saved ✓</span>
        <span className="save-btn__remove-label">× Remove</span>
      </button>
    );
  }

  if (!editing) {
    return (
      <button className="save-btn" onClick={() => setEditing(true)}>
        <span className="save-btn__label">Save location</span>
      </button>
    );
  }

  function commit() {
    const finalName = name.trim() || formatCoords(lat, lng);
    toggle({ kind: "gps", lat, lng, name: finalName });
    setEditing(false);
  }

  return (
    <form
      className="save-gps-form"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        type="text"
        aria-label="Location name"
        placeholder={formatCoords(lat, lng)}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <button type="submit" className="save-btn">Save</button>
    </form>
  );
}
