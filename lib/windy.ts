/** Round to 3 decimals for a Windy path segment. The Number round-trip
 *  normalizes negative values that round to zero ("-0.000" → "0.000"). */
function seg(value: number): string {
  return Number(value.toFixed(3)).toFixed(3);
}

/** Windy.com map link for a point, e.g. https://www.windy.com/47.554/-121.550 */
export function windyUrl(lat: number, lng: number): string {
  return `https://www.windy.com/${seg(lat)}/${seg(lng)}`;
}
