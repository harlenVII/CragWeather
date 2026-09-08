"use client";
import { useEffect, useState } from "react";
import { ForecastChart } from "@/components/ForecastChart";
import { WeatherChart } from "@/components/WeatherChart";
import { DailyCards } from "@/components/DailyCards";
import { localDayAndHour, sliceWeather } from "@/lib/sliceWeather";
import type { DailyWeather, HourlyWeather } from "@/lib/weather";
import type { AirQualityResponse } from "@/lib/airQuality";

const DAY_OPTIONS = [7, 10, 15] as const;
type DayOption = (typeof DAY_OPTIONS)[number];
const LS_KEY = "cragweather_days";

export function WeatherView({
  weather,
  air,
}: {
  weather: { daily: DailyWeather[]; hourly: HourlyWeather[] };
  air?: AirQualityResponse | null;
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
        {/* `air` is forwarded unsliced: ForecastChart looks AQ up per weather
            hour, so the day-window slice already applied to forecastHourly
            propagates to it. Slicing it separately would be a second source of
            truth for the window. */}
        <ForecastChart hourly={forecastHourly} daily={forecastDaily} air={air} />
      </section>
      <section className="route-cards">
        <DailyCards daily={forecastDaily} hourly={forecastHourly} today={today} />
      </section>
      <section className="route-chart route-chart-history">
        <h2 className="chart-section-title">Past {days} days &amp; today</h2>
        <WeatherChart daily={historyDaily} nowHour={nowHour} />
      </section>
    </>
  );
}
