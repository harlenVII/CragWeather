import { notFound, redirect } from "next/navigation";
import { resolveShortLink } from "@/lib/mp-scraper";

// Resolves a Mountain Project /v/<id> short link to its canonical route by
// following the redirect server-side (the /v/ number is not the route id), then
// redirects to /route/<realId>. 404s when the link isn't a route (forum/area/etc).
export default async function ShortLinkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const routeId = await resolveShortLink(id);
  if (!routeId) notFound();
  redirect(`/route/${routeId}`);
}
