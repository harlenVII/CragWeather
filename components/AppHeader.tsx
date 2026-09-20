"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBox } from "@/components/SearchBox";
import { ThemeToggle } from "@/components/ThemeToggle";

/** Sticky on every page. Search is omitted on "/" because the home page's hero
 *  search is already the focus there; everywhere else this is the only way to
 *  reach another route without going back. Replaces the per-page
 *  "← Search another route" footer link. */
export function AppHeader() {
  const pathname = usePathname();
  const showSearch = pathname !== "/";

  return (
    <header className="app-header">
      <Link href="/" className="app-header__mark">
        CragWeather
      </Link>
      {showSearch && (
        <div className="app-header__search">
          <SearchBox variant="compact" />
        </div>
      )}
      <ThemeToggle />
    </header>
  );
}
