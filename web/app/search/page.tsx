import SearchForm from "./SearchForm";

export const dynamic = "force-dynamic";

interface BraveResult {
  title: string;
  url: string;
  description?: string;
  meta_url?: { hostname: string };
}

interface SearchResult {
  title: string;
  url: string;
  description?: string;
  display_url: string;
}

async function braveSearch(q: string): Promise<SearchResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return [];

  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(q)}&count=10&search_lang=en&country=ca&safesearch=moderate`;

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip",
        "X-Subscription-Token": key,
      },
      next: { revalidate: 0 },
    });

    if (!res.ok) return [];

    const data = await res.json() as { web?: { results?: BraveResult[] } };

    return (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      description: r.description,
      display_url: r.meta_url?.hostname ?? new URL(r.url).hostname,
    }));
  } catch {
    return [];
  }
}

async function askDorotka(query: string, context: string): Promise<string | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/ask`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, context }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as { answer?: string };
    return data.answer ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return {
    title: q ? `${q} — box fraise` : "search — box fraise",
  };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const isAsk = query.toLowerCase().startsWith("/ask") || query.toLowerCase().startsWith("ask ");

  const results = isAsk ? [] : (query ? await braveSearch(query) : []);
  const dorotkaAnswer = isAsk ? await askDorotka(query, "fraise") : null;

  return (
    <>
      <header className="search-header">
        <a className="search-logo" href="/">box fraise</a>
        <SearchForm initialQuery={query} />
      </header>

      <main className="search-main">
        {dorotkaAnswer && (
          <div className="dorotka-answer">
            <p className="dorotka-label">dorotka</p>
            <p className="dorotka-text">{dorotkaAnswer}</p>
          </div>
        )}

        {isAsk && !dorotkaAnswer && (
          <p className="search-status">dorotka is unavailable.</p>
        )}

        {!query && (
          <p className="search-status">no query.</p>
        )}

        {!isAsk && query && results.length === 0 && (
          <p className="search-status">no results.</p>
        )}

        {results.length > 0 && (
          <>
            <p className="search-query-line">
              {results.length} results for &ldquo;{query}&rdquo;
            </p>
            <div className="search-results">
              {results.map((r, i) => (
                <div key={i} className="search-result">
                  <p className="search-result-url">{r.display_url}</p>
                  <p className="search-result-title">
                    <a href={r.url} rel="noopener noreferrer">
                      {r.title}
                    </a>
                  </p>
                  {r.description && (
                    <p className="search-result-desc">{r.description}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
