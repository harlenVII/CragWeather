"use client";
import Link from "next/link";

export default function RouteError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isUnavailable = /route_unavailable/.test(error.message);
  return (
    <main className="route-page">
      <h1>Couldn&apos;t load this route</h1>
      <p>
        {isUnavailable
          ? "Mountain Project didn't return a usable page for this route."
          : "Something went wrong on our side."}
      </p>
      <p>
        <Link href="/">← Back to search</Link>
      </p>
    </main>
  );
}
