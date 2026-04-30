import { NextRequest, NextResponse } from "next/server";

const RUST_API = process.env.RUST_API_URL ?? "https://api.fraise.box";

export async function POST(req: NextRequest) {
  let body: { query: string; context?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  if (!body.query?.trim()) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  // Forward to the Rust server. The Anthropic key lives there — never here.
  try {
    const upstream = await fetch(`${RUST_API}/api/dorotka/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query:   body.query,
        context: body.context ?? "fraise",
      }),
    });

    const data = await upstream.json();

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Dorotka is unavailable" },
        { status: upstream.status }
      );
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Dorotka is unavailable" }, { status: 503 });
  }
}
