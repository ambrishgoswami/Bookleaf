import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, Headset, LifeBuoy, Search } from "lucide-react";
import { api } from "../../lib/api";
import type { HelpArticle, TicketCategory } from "../../lib/types";
import { BackButton, Button, EmptyState, Spinner, cx } from "../../components/ui";

export function useHelpSearch(query: string, limit = 20) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  return useQuery({
    queryKey: ["help", debounced, limit],
    queryFn: () => api<{ data: HelpArticle[] }>(`/help/articles?limit=${limit}&q=${encodeURIComponent(debounced)}`),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function ArticleCard({ article, defaultOpen = false }: { article: HelpArticle; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-[14px] border border-white/10 bg-[#1e1e1e] transition-colors open:border-brand/40">
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-semibold text-foreground">{article.title}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{article.summary}</span>
        </span>
        <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-2 border-t border-white/10 px-4 py-3 text-sm leading-relaxed text-[#d2d2d2]">
        {article.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">{article.categoryLabel}</p>
      </div>
    </details>
  );
}

const CATEGORY_CHIPS: { value: TicketCategory | ""; label: string }[] = [
  { value: "", label: "All topics" },
  { value: "ROYALTY_PAYMENTS", label: "Royalties" },
  { value: "BOOK_STATUS_PRODUCTION", label: "Production" },
  { value: "DISTRIBUTION_AVAILABILITY", label: "Distribution" },
  { value: "PRINTING_QUALITY", label: "Printing" },
  { value: "ISBN_METADATA", label: "ISBN & listing" },
  { value: "GENERAL_INQUIRY", label: "General" },
];

export function HelpPage() {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [category, setCategory] = useState<TicketCategory | "">("");
  const results = useHelpSearch(q);

  useEffect(() => {
    setParams(q ? { q } : {}, { replace: true });
  }, [q, setParams]);

  const articles = (results.data?.data ?? []).filter((a) => !category || a.category === category);

  return (
    <div className="mx-auto max-w-3xl">
      <BackButton fallback="/books" />
      <div className="mb-6 text-center">
        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-brand/10 text-brand">
          <LifeBuoy className="size-7" aria-hidden />
        </span>
        <h2 className="font-display text-3xl font-semibold">How can we help?</h2>
        <p className="mt-1 text-sm text-muted-foreground">Answers to the most common questions about royalties, production, printing and listings.</p>
      </div>

      <label className="mb-4 flex items-center gap-2 rounded-full border border-brand bg-background px-4 py-2.5">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search, e.g. “when is my royalty paid?”"
          className="min-w-0 flex-1 bg-transparent font-display text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
          aria-label="Search help articles"
        />
      </label>

      <div className="no-scrollbar mb-5 flex gap-2 overflow-x-auto pb-1">
        {CATEGORY_CHIPS.map((c) => (
          <button
            key={c.label}
            onClick={() => setCategory(c.value)}
            className={cx(
              "shrink-0 rounded-[7px] border px-3 py-1 font-display text-sm font-semibold transition-colors",
              category === c.value ? "border-brand bg-brand text-brand-foreground" : "border-white/15 text-[#d2d2d2] hover:border-brand hover:text-brand",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {results.isPending ? (
        <Spinner />
      ) : articles.length === 0 ? (
        <EmptyState title="No articles match" body="Try different words — or ask our team directly." />
      ) : (
        <div className="space-y-3">
          {articles.map((a, i) => (
            <ArticleCard key={a.slug} article={a} defaultOpen={Boolean(q) && i === 0} />
          ))}
        </div>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 rounded-[14px] border border-white/10 bg-[#1e1e1e] p-6 text-center sm:flex-row sm:text-left">
        <Headset className="size-8 shrink-0 text-brand" aria-hidden />
        <div className="flex-1">
          <p className="font-display text-lg font-semibold">Still need help?</p>
          <p className="text-sm text-muted-foreground">Our author support team usually replies within one business day.</p>
        </div>
        <Link to="/new-ticket">
          <Button variant="brand" className="rounded-[7px]">
            Raise a query
          </Button>
        </Link>
      </div>
    </div>
  );
}
