import Link from "next/link";
import { redirect } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { SavedRoutes } from "@/components/SavedRoutes";
import { searchRoutes } from "@/lib/search";

const MP_URL_RE = /mountainproject\.com\/route\/(\d+)/;

const POPULAR_NAMES = [
  "The Nose",
  "Astroman",
  "Epinephrine",
  "The Naked Edge",
  "Royal Arches",
  "High Exposure",
];

async function getPopular() {
  const found = await Promise.all(POPULAR_NAMES.map((n) => searchRoutes(n, 1)));
  return found.map((rs) => rs[0]).filter((r): r is NonNullable<typeof r> => Boolean(r));
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ mp?: string }>;
}) {
  const { mp } = await searchParams;
  const match = mp ? MP_URL_RE.exec(mp) : null;
  if (match) redirect(`/route/${match[1]}`);

  const popular = await getPopular();
  return (
    <main className="home">
      <header className="home-header">
        <h1>CragWeather</h1>
        <p>14-day weather windows for climbing routes.</p>
      </header>
      <section className="home-search">
        <SearchBox />
      </section>
      <SavedRoutes />
      {popular.length > 0 && (
        <section className="home-popular">
          <h2>Popular routes</h2>
          <ul>
            {popular.map((r) => (
              <li key={r.id}>
                <Link href={`/route/${r.id}`}>{r.name}</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <footer className="home-footer">
        <Link href="/about">About &amp; data sources</Link>
      </footer>
    </main>
  );
}
