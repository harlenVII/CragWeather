import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sharedLists } from "@/lib/schema";
import { validateRoutesBody } from "@/lib/list-validation";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }
  const routes = validateRoutesBody(body);
  if (!routes) return NextResponse.json({ error: "bad_body" }, { status: 400 });

  const [row] = await db.insert(sharedLists).values({ routes }).returning({ id: sharedLists.id });
  return NextResponse.json({ id: row.id });
}
