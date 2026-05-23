"use client";
import { useState } from "react";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

export function DailyCards({
  daily,
  hourly,
}: {
  daily: DailyWeather[];
  hourly: HourlyWeather[];
}) {
  const [openDate, setOpenDate] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);
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
