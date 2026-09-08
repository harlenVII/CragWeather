/**
 * Dew-point thresholds for rock friction, in °C.
 *
 * These are climbers' rules of thumb, not physics: dew point is a direct read on
 * how much water vapour the air actually holds, and adsorbed surface moisture
 * degrades friction long before anything visibly condenses. The widely used
 * figures are "under 40°F is good, over 55–60°F is greasy"; these are that,
 * rounded to whole degrees Celsius.
 *
 * They live here rather than inline in the panel because three places have to
 * agree on them: the reference bands, the y-axis domain that guarantees those
 * bands stay on scale (`dewPointDomain`), and the explainer note under the
 * chart. Drift between any two of those is a silently wrong chart.
 */

/** At or below this dew point the air is dry and friction is good. */
export const GOOD_MAX_C = 5;

/** At or above this dew point rock starts to feel greasy. */
export const GREASY_MIN_C = 15;
