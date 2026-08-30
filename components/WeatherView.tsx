"use client";
import { useEffect, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { WeatherChart } from "@/components/WeatherChart";
import { DailyCards } from "@/components/DailyCards";
import { localDayAndHour, sliceWeather } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";

const DAY_OPTIONS = [7, 10, 15] as const;
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

  const { today, nowHour } = localDayAndHour(new Date());
  const { forecastHourly, forecastDaily, historyDaily } = sliceWeather(weather, today, days, nowHour);
  const forecastIncomplete = forecastHourly.length < days * 24;

  return (
    <>
      {forecastIncomplete && (
        <p className="weather-warning">
          Some weather data is unavailable — forecast may be incomplete.
        </p>
      )}
      <div className="day-picker-bar">
        {DAY_OPTIONS.map(n => (
          <button
            key={n}
            type="button"
            className={`day-picker-btn${days === n ? " active" : ""}`}
            onClick={() => handleDays(n)}
            aria-pressed={days === n}
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
        <h2 className="chart-section-title">Past {days} days &amp; today</h2>
        <WeatherChart daily={historyDaily} nowHour={nowHour} />
      </section>
    </>
  );
}
