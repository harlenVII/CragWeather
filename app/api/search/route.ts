import { NextResponse } from "next/server";
import { searchRoutes } from "@/lib/search";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchRoutes(q);
  return NextResponse.json({ results });
}
