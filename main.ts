// Promenergo transport probe — Deno Deploy.
//
// Purpose: diagnose ONLY whether Deno Deploy's outbound network can reach
// https://xn--80aaagdlzqlegkecgqe4bd2s.xn--p1ai/sklad/ (промэнергоавтоматика.рф)
// without hitting the HTTP 403 that Vercel (and Google Apps Script/GCP)
// get. Returns a small diagnostic JSON only — never the full page HTML.
//
// Hardcoded upstream — this does NOT accept a `url` parameter from the
// caller. Not a generic proxy.

const UPSTREAM_URL = "https://xn--80aaagdlzqlegkecgqe4bd2s.xn--p1ai/sklad/";
const KNOWN_ARTICLE = "PPS-1G0612";

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const providedSecret = url.searchParams.get("secret") ?? "";
  const expectedSecret = Deno.env.get("PROBE_SECRET");

  if (!expectedSecret) {
    return Response.json({ error: "PROBE_SECRET is not configured in project environment variables" }, { status: 500 });
  }
  if (providedSecret !== expectedSecret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(UPSTREAM_URL, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadQualificationBot/1.0)" },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const body = await res.text();
    const durationMs = Date.now() - startedAt;

    return Response.json({
      status: res.status,
      bodyLength: body.length,
      hasStockStart: body.includes("stockstart"),
      hasKnownArticle: body.includes(KNOWN_ARTICLE),
      contentType: res.headers.get("content-type"),
      location: res.headers.get("location"),
      setCookie: res.headers.get("set-cookie") ? "present" : null,
      bodySnippet: body.length > 0 && body.length < 2000 ? body.slice(0, 500) : undefined,
      durationMs,
    });
  } catch (err) {
    return Response.json(
      {
        error: "fetch_failed",
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - startedAt,
      },
      { status: 502 },
    );
  }
});
