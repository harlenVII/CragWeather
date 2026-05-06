import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-page">
      <h1>Route not found</h1>
      <p>
        Either this route is not in our index yet, or the link is wrong. The monthly indexer
        runs on the 1st of each month.
      </p>
      <p><Link href="/">← Back to search</Link></p>
    </main>
  );
}
