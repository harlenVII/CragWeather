import { http, HttpResponse } from "msw";

// Default handlers — individual tests override with server.use(...).
export const handlers = [
  http.all("https://www.mountainproject.com/*", () =>
    HttpResponse.text("default mock — override in test", { status: 200 }),
  ),
  http.all("https://api.open-meteo.com/*", () =>
    HttpResponse.json({}, { status: 200 }),
  ),
];
