/**
 * The single source of truth for how chart elements are themed.
 *
 * These are CSS class names, not colors. The colors live in app/styles/tokens.css
 * and are applied by rules in app/styles/components.css. Recharts takes colors as
 * props, and a prop cannot hold a CSS variable that changes with the theme — so the
 * panels carry a class and CSS does the painting. The panels never learn which theme
 * is active, take no theme prop, and their React.memo (see the measured hover-jank
 * note in ForecastChart) is untouched.
 *
 * Where the class lands differs per Recharts component, which is why the CSS rules
 * use different selectors. tests/components/rechartsClassName.test.tsx pins that
 * behaviour; read it before changing a selector.
 *
 * Tests assert on these constants, so they check that the right *role* is drawn and
 * survive any palette change.
 */
export const SERIES = {
  temp: "series-temp",
  feelsLike: "series-feels",
  low: "series-low",
  precip: "series-precip",
  precipChance: "series-chance",
  wind: "series-wind",
  gust: "series-gust",
  dewPoint: "series-dew",
  humidity: "series-humidity",
  aqi: "series-aqi",
} as const;

/**
 * var() references, for the few places Recharts feeds a color into HTML instead of
 * SVG. WeatherChart's Tooltip is the only one: it renders each entry as an HTML span
 * with an inline `color` style, and an inline style is an ordinary CSS declaration
 * where var() resolves normally. The class still paints the SVG; this exists only so
 * the tooltip text is not Recharts' default blue.
 */
export const SERIES_VAR = {
  temp: "var(--series-temp)",
  low: "var(--series-low)",
  precip: "var(--series-precip)",
} as const;

export const BANDS = {
  night: "band-night",
  weekend: "band-weekend",
  dewGood: "band-dew-good",
  dewGreasy: "band-dew-greasy",
  aqiDead: "band-aqi-dead",
} as const;

/** EPA hues stay on the `fill` prop; only their alpha is themed. */
export const AQI_BAND_CLASS = "aqi-band";

/** For the hover readout's text, which is ordinary DOM, not SVG. */
export const READOUT = {
  temp: "readout-temp",
  feelsLike: "readout-feels",
  dewPoint: "readout-dew",
  precip: "readout-precip",
  precipChance: "readout-chance",
  wind: "readout-wind",
  humidity: "readout-humidity",
} as const;
