"use client";

import { useState } from "react";
import { GpsTitle } from "@/components/GpsTitle";
import { SaveButton } from "@/components/SaveButton";
import type { SavedGpsRoute } from "@/lib/favorites";

/** Owns the shared save state so GpsTitle reflects a save/remove immediately, without a page reload. */
export function GpsHeader({ lat, lng }: { lat: number; lng: number }) {
  const [override, setOverride] = useState<SavedGpsRoute | null | undefined>(undefined);

  return (
    <>
      <GpsTitle lat={lat} lng={lng} override={override} />
      <SaveButton gps={{ lat, lng }} onSaved={setOverride} />
    </>
  );
}
