"use client";
import { useState } from "react";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

export function DailyCards({
  daily,
  hourly,
  today,
}: {
  daily: DailyWeather[];
  hourly: HourlyWeather[];
  today: string;
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  return (
    <div className="cards-row">
      {daily.map((d) => {
        const isOpen = d.date === openDate;
        const dayHourly = hourly.filter((h) => h.datetime.startsWith(d.date));
        return (
          <div key={d.date} className="card-cell">
            <button
              type="button"
              className={`card${isOpen ? " card-open" : ""}`}
              onClick={() => setOpenDate(isOpen ? null : d.date)}
              aria-expanded={isOpen}
            >
              <div className="card-date">{d.date.slice(5)}</div>
              <div className="card-temps">
                <span className="hi">{Math.round(d.tempMax)}°</span>
                <span className="lo">{Math.round(d.tempMin)}°</span>
              </div>
              <div className="card-precip">{d.precip.toFixed(1)} mm</div>
              {/* Exact to the minute here; the night bands on the forecast panels
                  are snapped to the hour by the category x-axis, so this row is
                  the only place the real times are stated. */}
              {d.sunrise && d.sunset && (
                <div className="card-sun" data-testid="card-sun">
                  <span aria-hidden="true">&#9788;</span>
                  <span>{d.sunrise.slice(11, 16)}</span>
                  <span aria-hidden="true">&#9790;</span>
                  <span>{d.sunset.slice(11, 16)}</span>
                </div>
              )}
              {d.model && d.date >= today && <div className="card-model">{d.model}</div>}
            </button>
            {isOpen && (
              <ul className="hourly-list">
                {dayHourly.map((h) => (
                  <li key={h.datetime}>
                    <span>{h.datetime.slice(11, 16)}</span>
                    <span>{Math.round(h.temp)}°</span>
                    <span>{h.precip.toFixed(1)} mm</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
