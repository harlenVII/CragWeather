import { windyUrl } from "@/lib/windy";

/** External link to the Windy map for a point. Plain anchor — safe in server components. */
export function WindyLink({ lat, lng }: { lat: number; lng: number }) {
  return (
    <a href={windyUrl(lat, lng)} target="_blank" rel="noreferrer">
      View on Windy ↗
    </a>
  );
}
