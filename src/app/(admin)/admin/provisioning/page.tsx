'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronUp,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  PackagePlus,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  ChevronRight as ChevronRightIcon,
} from 'lucide-react';
import type {
  ProvisioningRow,
  ProvisioningSummary,
  IntentStatus,
} from '@/lib/admin/queries/provisioning';
import {
  INTENT_STATUSES,
  INTENT_STATUS_COLORS,
} from '@/lib/admin/queries/provisioning';
import { AdminFetchError } from '@/components/admin/AdminFetchError';
import { TableSkeleton, KpiCardsSkeleton } from '@/components/admin/AdminSkeletons';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortDir = 'asc' | 'desc';

type ApiResponse = {
  data: ProvisioningRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: ProvisioningSummary;
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
  { key: 'ownerName', label: 'Owner', sortable: false },
  { key: 'restaurantName', label: 'Restaurant', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'organizationId', label: 'Org ID', sortable: false, className: 'hidden lg:table-cell' },
  { key: 'desiredQuantity', label: 'Qty', sortable: true, className: 'text-right hidden sm:table-cell' },
  { key: 'lastError', label: 'Error', sortable: false },
  { key: 'createdAt', label: 'Created', sortable: true },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminProvisioningPage() {
  const [rows, setRows] = useState<ProvisioningRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ProvisioningSummary | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  // Sort
  const [sortColumn, setSortColumn] = useState('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const initialRef = useRef(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (errorsOnly) params.set('hasError', 'true');
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    params.set('sortColumn', sortColumn);
    params.set('sortDirection', sortDir);

    try {
      const res = await fetch(
        `/api/admin/provisioning?${params.toString()}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (res.ok) {
        const json: ApiResponse = await res.json();
        setRows(json.data);
        setTotal(json.total);
        setSummary(json.summary);
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
  }, [statusFilter, errorsOnly, page, pageSize, sortColumn, sortDir]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir(col === 'created_at' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-zinc-900">Provisioning</h2>

      {/* Error state */}
      {error && !loading && (
        <AdminFetchError
          message="Failed to load provisioning data"
          detail={error}
          onRetry={() => fetchData()}
        />
      )}

      {/* Loading skeleton */}
      {loading && rows.length === 0 && !error && !summary && (
        <>
          <KpiCardsSkeleton count={6} />
          <TableSkeleton rows={6} columns={COLUMNS.length} />
        </>
      )}

      {/* Summary cards */}
      {summary && !error && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <SummaryCard
            label="Total"
            value={summary.total}
            icon={<PackagePlus className="h-4 w-4 text-indigo-500" />}
            color="border-indigo-200"
          />
          <SummaryCard
            label="Completed"
            value={summary.completed}
            icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}
            color="border-emerald-200"
          />
          <SummaryCard
            label="Failed"
            value={summary.failed}
            icon={<XCircle className="h-4 w-4 text-red-500" />}
            color="border-red-200"
          />
          <SummaryCard
            label="Pending"
            value={summary.pending}
            icon={<Clock className="h-4 w-4 text-blue-500" />}
            color="border-blue-200"
          />
          <SummaryCard
            label="Canceled"
            value={summary.canceled}
            icon={<XCircle className="h-4 w-4 text-zinc-400" />}
            color="border-zinc-200"
          />
          <SummaryCard
            label="With Errors"
            value={summary.withErrors}
            icon={<AlertTriangle className="h-4 w-4 text-amber-500" />}
            color="border-amber-200"
          />
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          aria-label="Filter by intent status"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All statuses</option>
          {INTENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>

        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-50">
          <input
            type="checkbox"
            checked={errorsOnly}
            onChange={(e) => { setErrorsOnly(e.target.checked); setPage(1); }}
            className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
          />
          Errors only
        </label>
      </div>

      {/* Table */}
      {!error && !(loading && rows.length === 0 && !summary) && (
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
                  {statusFilter || errorsOnly
                    ? 'No provisioning intents match your filters.'
                    : 'No provisioning history available.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <IntentTableRow key={row.id} row={row} />
              ))
            )}
          </tbody>
        </table>
      </div>
      )}

      {/* Pagination */}
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
          <PagBtn onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
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
          <PagBtn onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
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

function SummaryCard({
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
    <div className={`flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm ${color}`}>
      {icon}
      <div>
        <p className="text-xl font-bold text-zinc-900">{value}</p>
        <p className="text-xs text-zinc-500">{label}</p>
      </div>
    </div>
  );
}

function IntentTableRow({ row }: { row: ProvisioningRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = row.lastError != null;
  const statusColors =
    INTENT_STATUS_COLORS[row.status as IntentStatus] ?? 'bg-zinc-100 text-zinc-600';

  const errorText = hasError
    ? typeof row.lastError === 'string'
      ? row.lastError
      : JSON.stringify(row.lastError, null, 2)
    : null;

  return (
    <>
      <tr className={`transition-colors hover:bg-zinc-50 ${hasError ? 'bg-red-50/30' : ''}`}>
        <td className="px-4 py-3 text-zinc-600">
          {row.ownerName ?? (
            <span className="font-mono text-xs text-zinc-400">
              {row.authUserId.slice(0, 8)}…
            </span>
          )}
        </td>
        <td className="px-4 py-3 font-medium text-zinc-800">
          {row.restaurantName}
        </td>
        <td className="px-4 py-3">
          <span role="status" aria-label={`Intent status: ${row.status}`} className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors}`}>
            {row.status}
          </span>
        </td>
        <td className="hidden px-4 py-3 lg:table-cell">
          {row.organizationId ? (
            <Link
              href={`/admin/restaurants/${row.organizationId}`}
              className="font-mono text-xs text-indigo-600 hover:underline"
            >
              {row.organizationId.slice(0, 8)}…
            </Link>
          ) : (
            <span className="text-xs text-zinc-300">—</span>
          )}
        </td>
        <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-600 sm:table-cell">
          {row.desiredQuantity}
        </td>
        <td className="px-4 py-3">
          {hasError ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              aria-label="Toggle error details"
              className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-200"
            >
              <AlertTriangle className="h-3 w-3" />
              Error
              <ChevronRightIcon
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <span className="text-xs text-zinc-300">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-xs text-zinc-500">
          {new Date(row.createdAt).toLocaleString()}
        </td>
      </tr>
      {expanded && errorText && (
        <tr>
          <td colSpan={COLUMNS.length} className="bg-red-50 px-4 py-3">
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-red-100 p-3 font-mono text-xs text-red-800">
              {errorText}
            </pre>
          </td>
        </tr>
      )}
    </>
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
