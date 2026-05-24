import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sharedLists } from "@/lib/schema";
import { ConfirmJoin } from "./ConfirmJoin";
import type { SavedRoute } from "@/lib/favorites";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SharedListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const row = await db.query.sharedLists.findFirst({ where: eq(sharedLists.id, id) });
  if (!row) notFound();

  return <ConfirmJoin listId={id} routes={row.routes as SavedRoute[]} />;
}
