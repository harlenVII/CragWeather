"use client";
import { useEffect, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { WeatherChart } from "@/components/WeatherChart";
import { DailyCards } from "@/components/DailyCards";
import { sliceWeather } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

const DAY_OPTIONS = [7, 10, 14, 16] as const;
type DayOption = (typeof DAY_OPTIONS)[number];
const LS_KEY = "cragweather_days";

export function WeatherView({
  weather,
}: {
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] };
}) {
  const [days, setDays] = useState<DayOption>(7);

  useEffect(() => {
    const stored = Number(localStorage.getItem(LS_KEY));
    if ((DAY_OPTIONS as readonly number[]).includes(stored)) {
      setDays(stored as DayOption);
    }
  }, []);

  function handleDays(n: DayOption) {
    setDays(n);
    localStorage.setItem(LS_KEY, String(n));
  }

  const today = new Date().toISOString().slice(0, 10);
  const { forecastHourly, forecastDaily, historyDaily } = sliceWeather(weather, today, days);

  return (
    <>
      <div className="day-picker-bar">
        {DAY_OPTIONS.map(n => (
          <button
            key={n}
            type="button"
            className={`day-picker-btn${days === n ? " active" : ""}`}
            onClick={() => handleDays(n)}
          >
            {n}d
          </button>
        ))}
      </div>
      <section className="route-chart">
        <ForecastChart hourly={forecastHourly} />
      </section>
      <section className="route-cards">
        <DailyCards daily={forecastDaily} hourly={forecastHourly} />
      </section>
      <section className="route-chart route-chart-history">
        <h2 className="chart-section-title">Past {days} days</h2>
        <WeatherChart daily={historyDaily} />
      </section>
    </>
  );
}
