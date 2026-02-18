'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { Search, Building2, User, Loader2 } from 'lucide-react';
import type { SearchResultItem } from '@/lib/admin/queries/search';

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // -----------------------------------------------------------------------
  // Fetch
  // -----------------------------------------------------------------------
  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/search?q=${encodeURIComponent(q.trim())}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (res.ok) {
        const json: { results: SearchResultItem[] } = await res.json();
        setResults(json.results);
        setOpen(true);
        setActiveIndex(-1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(val), 300);
  };

  // -----------------------------------------------------------------------
  // Navigation
  // -----------------------------------------------------------------------
  const navigate = (url: string) => {
    setOpen(false);
    setQuery('');
    setResults([]);
    router.push(url);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) {
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => (i < results.length - 1 ? i + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < results.length) {
          navigate(results[activeIndex].url);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
        break;
    }
  };

  // -----------------------------------------------------------------------
  // Click outside
  // -----------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full max-w-sm">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search orgs, accounts…"
          aria-label="Global search for organizations and accounts"
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
          className="w-full rounded-md border border-zinc-200 bg-zinc-50 py-1.5 pl-9 pr-8 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-full overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-400">
              No results found.
            </p>
          ) : (
            <ul role="listbox">
              {results.map((item, i) => (
                <li key={`${item.type}-${item.id}`} role="option" aria-selected={i === activeIndex}>
                  <button
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => navigate(item.url)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 ${
                      i === activeIndex
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {item.type === 'restaurant' ? (
                      <Building2 className="h-4 w-4 shrink-0 text-zinc-400" />
                    ) : (
                      <User className="h-4 w-4 shrink-0 text-zinc-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.label}</p>
                      <p className="truncate font-mono text-xs text-zinc-400">
                        {item.sublabel}
                      </p>
                    </div>
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500">
                      {item.type === 'restaurant' ? 'Org' : 'Account'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
