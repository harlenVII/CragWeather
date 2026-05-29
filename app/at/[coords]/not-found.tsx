import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-page">
      <h1>Invalid coordinates</h1>
      <p>
        That doesn&apos;t look like a valid GPS location. Latitude must be between −90 and 90,
        longitude between −180 and 180.
      </p>
      <p><Link href="/">← Back to search</Link></p>
    </main>
  );
}
