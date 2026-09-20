"use client";

import { useState, type ReactNode } from "react";
import { GpsTitle } from "@/components/GpsTitle";
import { SaveButton } from "@/components/SaveButton";
import { RouteHeader } from "@/components/RouteHeader";
import type { SavedGpsRoute } from "@/lib/favorites";

/** Owns the shared save state so GpsTitle reflects a save/remove immediately,
 *  without a page reload. */
export function GpsHeader({
  lat,
  lng,
  links,
  children,
}: {
  lat: number;
  lng: number;
  links?: ReactNode;
  children?: ReactNode;
}) {
  const [override, setOverride] = useState<SavedGpsRoute | null | undefined>(undefined);

  return (
    <RouteHeader
      title={<GpsTitle lat={lat} lng={lng} override={override} />}
      chips={[]}
      actions={
        <>
          <SaveButton gps={{ lat, lng }} onSaved={setOverride} />
          {links}
        </>
      }
    >
      {children}
    </RouteHeader>
  );
}
