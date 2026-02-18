'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CreditCard,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Ban,
  Download,
} from 'lucide-react';
import type { SubscriptionRow, SubscriptionAggregates } from '@/lib/admin/queries/subscriptions';
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_COLORS,
  type SubscriptionStatusOption,
} from '@/lib/admin/constants';
import { AdminFetchError } from '@/components/admin/AdminFetchError';
import { TableSkeleton, KpiCardsSkeleton } from '@/components/admin/AdminSkeletons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc';

type ApiResponse = {
  data: SubscriptionRow[];
  total: number;
  page: number;
  pageSize: number;
  aggregates: SubscriptionAggregates;
};

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

const COLUMNS: {
  key: string;
  label: string;
  sortable: boolean;
  className?: string;
}[] = [
  { key: 'orgName', label: 'Organization', sortable: false },
  { key: 'ownerName', label: 'Owner', sortable: false, className: 'hidden md:table-cell' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'currentPeriodEnd', label: 'Period End', sortable: true },
  { key: 'priceId', label: 'Price ID', sortable: true, className: 'hidden lg:table-cell' },
  { key: 'quantity', label: 'Qty', sortable: true, className: 'text-right hidden sm:table-cell' },
  { key: 'cancelAtPeriodEnd', label: 'Cancel', sortable: true, className: 'text-center' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminSubscriptionsPage() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aggregates, setAggregates] = useState<SubscriptionAggregates | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [priceFilter, setPriceFilter] = useState('');
  const [cancelFilter, setCancelFilter] = useState('');

  // Sort
  const [sortColumn, setSortColumn] = useState('currentPeriodEnd');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Export
  const [exporting, setExporting] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchData = useCallback(
    async (searchVal: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchVal) params.set('search', searchVal);
      if (statusFilter) params.set('status', statusFilter);
      if (priceFilter) params.set('priceId', priceFilter);
      if (cancelFilter) params.set('cancelAtPeriodEnd', cancelFilter);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sortColumn', sortColumn);
      params.set('sortDirection', sortDir);

      try {
        const res = await fetch(
          `/api/admin/subscriptions?${params.toString()}`,
          { credentials: 'include', cache: 'no-store' },
        );
        if (res.ok) {
          const json: ApiResponse = await res.json();
          setRows(json.data);
          setTotal(json.total);
          setAggregates(json.aggregates);
          setError(null);
        } else {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? `Request failed (${res.status})`);
        }
      } catch {
        setError('Network error — could not reach the server.');
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, priceFilter, cancelFilter, page, pageSize, sortColumn, sortDir],
  );

  useEffect(() => {
    fetchData(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchData]);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(val), 300);
  };

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Collect unique price IDs from aggregates for the filter dropdown
  const priceIds = aggregates ? Object.keys(aggregates.byPriceId).sort() : [];

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/admin/export/subscriptions.csv', {
        credentials: 'include',
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        'crewshyft-subscriptions.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-900">Subscriptions</h2>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Export CSV
        </button>
      </div>

      {/* Error state */}
      {error && !loading && (
        <AdminFetchError
          message="Failed to load subscriptions"
          detail={error}
          onRetry={() => fetchData(search)}
        />
      )}

      {/* Loading skeleton */}
      {loading && rows.length === 0 && !error && !aggregates && (
        <>
          <KpiCardsSkeleton count={6} />
          <TableSkeleton rows={8} columns={COLUMNS.length} />
        </>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Aggregate KPI cards                                               */}
      {/* ----------------------------------------------------------------- */}
      {aggregates && !error && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <AggCard
              label="Active"
              value={aggregates.byStatus['active'] ?? 0}
              icon={<CreditCard className="h-4 w-4 text-emerald-500" />}
              color="border-emerald-200"
            />
            <AggCard
              label="Trialing"
              value={aggregates.byStatus['trialing'] ?? 0}
              icon={<Sparkles className="h-4 w-4 text-blue-500" />}
              color="border-blue-200"
            />
            <AggCard
              label="Past Due"
              value={aggregates.byStatus['past_due'] ?? 0}
              icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
              color="border-amber-200"
            />
            <AggCard
              label="Canceled"
              value={aggregates.byStatus['canceled'] ?? 0}
              icon={<XCircle className="h-4 w-4 text-zinc-400" />}
              color="border-zinc-200"
            />
            <AggCard
              label="Missing Sub"
              value={aggregates.orgsWithoutSubscription}
              icon={<Ban className="h-4 w-4 text-red-500" />}
              color="border-red-200"
            />
            <AggCard
              label="Pending Cancel"
              value={aggregates.cancelPending}
              icon={<Clock className="h-4 w-4 text-amber-500" />}
              color="border-amber-200"
            />
          </div>

          {/* Price ID breakdown */}
          {priceIds.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {priceIds.map((pid) => (
                <div
                  key={pid}
                  className="rounded-md border border-zinc-200 bg-white px-4 py-2 shadow-sm"
                >
                  <p className="text-lg font-bold text-zinc-900">
                    {aggregates.byPriceId[pid]}
                  </p>
                  <p
                    className="max-w-[180px] truncate font-mono text-xs text-zinc-400"
                    title={pid}
                  >
                    {pid}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Toolbar                                                           */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search org, code, or owner…"
            aria-label="Search subscriptions by organization, code, or owner"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter by subscription status"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All statuses</option>
          {SUBSCRIPTION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SUBSCRIPTION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>

        {priceIds.length > 0 && (
          <select
            value={priceFilter}
            onChange={(e) => { setPriceFilter(e.target.value); setPage(1); }}
            aria-label="Filter by price ID"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">All prices</option>
            {priceIds.map((pid) => (
              <option key={pid} value={pid}>
                {pid.length > 24 ? `${pid.slice(0, 24)}…` : pid}
              </option>
            ))}
          </select>
        )}

        <select
          value={cancelFilter}
          onChange={(e) => { setCancelFilter(e.target.value); setPage(1); }}
          aria-label="Filter by cancellation flag"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">Cancel flag: any</option>
          <option value="true">Pending cancel</option>
          <option value="false">Not canceling</option>
        </select>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Table                                                             */}
      {/* ----------------------------------------------------------------- */}
      {!error && !(loading && rows.length === 0 && !aggregates) && (
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 ${col.className ?? ''} ${col.sortable ? 'cursor-pointer select-none hover:text-zinc-700' : ''}`}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable &&
                      sortColumn === col.key &&
                      (sortDir === 'asc' ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length}
                  className="py-12 text-center text-sm text-zinc-400"
                >
                  {search || statusFilter || priceFilter || cancelFilter
                    ? 'No subscriptions match your filters.'
                    : 'No subscription records found.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <SubTableRow key={row.id} row={row} />
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* Pagination                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {total === 0
            ? 'No results'
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => setPage(1)} disabled={page <= 1}>
            <ChevronsLeft className="h-4 w-4" />
          </PagBtn>
          <PagBtn
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </PagBtn>
          <span className="px-3 font-medium text-zinc-700">
            {page} / {totalPages}
          </span>
          <PagBtn
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </PagBtn>
          <PagBtn
            onClick={() => setPage(totalPages)}
            disabled={page >= totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </PagBtn>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function AggCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm ${color}`}
    >
      {icon}
      <div>
        <p className="text-xl font-bold text-zinc-900">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

function SubTableRow({ row }: { row: SubscriptionRow }) {
  const statusColors =
    SUBSCRIPTION_STATUS_COLORS[row.status as SubscriptionStatusOption] ??
    'bg-zinc-100 text-zinc-600';
  const statusLabel =
    SUBSCRIPTION_STATUS_LABELS[row.status as SubscriptionStatusOption] ??
    row.status;

  return (
    <tr className="transition-colors hover:bg-zinc-50">
      <td className="px-4 py-3">
        <Link
          href={`/admin/restaurants/${row.orgId}`}
          className="font-medium text-indigo-600 hover:underline"
        >
          {row.orgName}
        </Link>
        <span className="ml-2 font-mono text-xs text-zinc-400">
          {row.restaurantCode}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-zinc-600 md:table-cell">
        {row.ownerName ?? <span className="text-zinc-300">—</span>}
      </td>
      <td className="px-4 py-3">
        <span
          role="status"
          aria-label={`Subscription status: ${statusLabel}`}
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors}`}
        >
          {statusLabel}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-zinc-500">
        {row.currentPeriodEnd
          ? new Date(row.currentPeriodEnd).toLocaleDateString()
          : '—'}
      </td>
      <td className="hidden px-4 py-3 font-mono text-xs text-zinc-400 lg:table-cell">
        <span className="max-w-[140px] truncate inline-block" title={row.priceId}>
          {row.priceId}
        </span>
      </td>
      <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-600 sm:table-cell">
        {row.quantity}
      </td>
      <td className="px-4 py-3 text-center">
        {row.cancelAtPeriodEnd ? (
          <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Yes
          </span>
        ) : (
          <span className="text-xs text-zinc-300">—</span>
        )}
      </td>
    </tr>
  );
}

function PagBtn({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
    >
      {children}
    </button>
  );
}
