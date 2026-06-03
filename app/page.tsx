import Link from "next/link";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { SearchBox } from "@/components/SearchBox";
import { SavedRoutes } from "@/components/SavedRoutes";
import { searchRoutes } from "@/lib/search";
import { parseSearchTarget } from "@/lib/searchTarget";
import { coordsPath } from "@/lib/parseCoords";

const POPULAR_NAMES = [
  "The Nose",
  "Astroman",
  "Epinephrine",
  "The Naked Edge",
  "Royal Arches",
  "High Exposure",
];

const getPopular = unstable_cache(
  async () => {
    const found = await Promise.all(POPULAR_NAMES.map((n) => searchRoutes(n, 1)));
    return found.map((rs) => rs[0]).filter((r): r is NonNullable<typeof r> => Boolean(r));
  },
  ["home-popular"],
  { revalidate: 3600 },
);

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  if (q) {
    const target = parseSearchTarget(q);
    if (target?.kind === "mp") redirect(`/route/${target.id}`);
    if (target?.kind === "coords") redirect(`/at/${coordsPath(target.lat, target.lng)}`);
  }

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
