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
  Trash2,
} from 'lucide-react';
import type { AccountRow, ProfileState } from '@/lib/admin/types';
import {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUS_COLORS,
  type SubscriptionStatusOption,
} from '@/lib/admin/constants';
import { AdminFetchError } from '@/components/admin/AdminFetchError';
import { TableSkeleton } from '@/components/admin/AdminSkeletons';

type SortDir = 'asc' | 'desc';
type ProfileStateFilter = 'all' | ProfileState;

type ApiResponse = {
  data: AccountRow[];
  total: number;
  page: number;
  pageSize: number;
  appliedProfileState?: ProfileStateFilter;
};

const COLUMNS: {
  key: string;
  label: string;
  sortable: boolean;
  className?: string;
}[] = [
  { key: 'ownerName', label: 'Owner Name', sortable: true },
  { key: 'authUserId', label: 'Auth User ID', sortable: false, className: 'hidden md:table-cell' },
  { key: 'profileState', label: 'Profile State', sortable: true },
  { key: 'billingStatus', label: 'Billing Status', sortable: true },
  { key: 'ownedOrganizationsCount', label: 'Orgs', sortable: true, className: 'text-right' },
  { key: 'locationsCount', label: 'Locations', sortable: true, className: 'text-right hidden lg:table-cell' },
  { key: 'employeesCount', label: 'Employees', sortable: true, className: 'text-right' },
  { key: 'lastShiftCreatedAt', label: 'Last Activity', sortable: true, className: 'hidden lg:table-cell' },
];

export default function AdminAccountsPage() {
  const [rows, setRows] = useState<AccountRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingAuthUserId, setDeletingAuthUserId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [billingStatus, setBillingStatus] = useState('');
  const [profileState, setProfileState] = useState<ProfileStateFilter>('all');

  const [sortColumn, setSortColumn] = useState('ownerName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchData = useCallback(
    async (searchVal: string) => {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchVal) params.set('search', searchVal);
      if (billingStatus) params.set('billingStatus', billingStatus);
      if (profileState !== 'all') params.set('profileState', profileState);
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sortColumn', sortColumn);
      params.set('sortDirection', sortDir);

      try {
        const res = await fetch(`/api/admin/accounts?${params.toString()}`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (res.ok) {
          const json: ApiResponse = await res.json();
          setRows(json.data);
          setTotal(json.total);
          setError(null);
        } else {
          const body = await res.json().catch(() => null);
          setError(body?.error ?? `Request failed (${res.status})`);
        }
      } catch {
        setError('Network error - could not reach the server.');
      } finally {
        setLoading(false);
      }
    },
    [billingStatus, profileState, page, pageSize, sortColumn, sortDir],
  );

  useEffect(() => {
    fetchData(search);
  }, [fetchData, search]);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchData(value), 300);
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDir('asc');
    }
    setPage(1);
  };

  const handleDeleteOrphan = async (row: AccountRow) => {
    if (!row.isOrphaned) return;
    const confirmed = window.confirm(
      `Delete orphaned account profile for ${row.authUserId}? This removes only public profile data, not the auth user.`,
    );
    if (!confirmed) return;

    setActionError(null);
    setDeletingAuthUserId(row.authUserId);
    try {
      const response = await fetch(`/api/admin/accounts/orphaned/${encodeURIComponent(row.authUserId)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setActionError(body?.error ?? `Delete failed (${response.status}).`);
        return;
      }
      await fetchData(search);
    } catch {
      setActionError('Unable to delete orphaned profile right now.');
    } finally {
      setDeletingAuthUserId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-zinc-900">Accounts</h2>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Search name, user ID, or email..."
            aria-label="Search accounts by name, user ID, or email"
            className="w-full rounded-md border border-zinc-300 bg-white py-2 pl-9 pr-3 text-sm text-zinc-800 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <select
          value={billingStatus}
          onChange={(event) => {
            setBillingStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by billing status"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">All billing statuses</option>
          <option value="none">No billing account</option>
          {SUBSCRIPTION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {SUBSCRIPTION_STATUS_LABELS[status]}
            </option>
          ))}
        </select>

        <select
          value={profileState}
          onChange={(event) => {
            setProfileState(event.target.value as ProfileStateFilter);
            setPage(1);
          }}
          aria-label="Filter by profile state"
          className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
        >
          <option value="all">Profile state: All</option>
          <option value="ok">Profile state: OK</option>
          <option value="missing_name">Profile state: Missing name</option>
          <option value="orphaned">Profile state: Orphaned</option>
        </select>
      </div>

      {actionError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {error && !loading && (
        <AdminFetchError
          message="Failed to load accounts"
          detail={error}
          onRetry={() => fetchData(search)}
        />
      )}

      {loading && rows.length === 0 && !error && (
        <TableSkeleton rows={8} columns={COLUMNS.length} />
      )}

      {!error && !(loading && rows.length === 0) && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                {COLUMNS.map((column) => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 ${column.className ?? ''} ${column.sortable ? 'cursor-pointer select-none hover:text-zinc-700' : ''}`}
                    onClick={column.sortable ? () => handleSort(column.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.label}
                      {column.sortable && sortColumn === column.key && (
                        sortDir === 'asc'
                          ? <ChevronUp className="h-3 w-3" />
                          : <ChevronDown className="h-3 w-3" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-50">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className="py-12 text-center text-sm text-zinc-400">
                    {search || billingStatus || profileState !== 'all'
                      ? 'No accounts match your filters.'
                      : 'No accounts have been created yet.'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <AccountTableRow
                    key={row.authUserId}
                    row={row}
                    deleting={deletingAuthUserId === row.authUserId}
                    onDeleteOrphan={handleDeleteOrphan}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {total === 0
            ? 'No results'
            : `Showing ${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} of ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <PagBtn onClick={() => setPage(1)} disabled={page <= 1}>
            <ChevronsLeft className="h-4 w-4" />
          </PagBtn>
          <PagBtn onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </PagBtn>
          <span className="px-3 font-medium text-zinc-700">
            {page} / {totalPages}
          </span>
          <PagBtn onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page >= totalPages}>
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

function AccountTableRow({
  row,
  deleting,
  onDeleteOrphan,
}: {
  row: AccountRow;
  deleting: boolean;
  onDeleteOrphan: (row: AccountRow) => void;
}) {
  const title = row.ownerName
    || (row.profileState === 'orphaned' ? 'Orphaned profile' : 'Unnamed Account');

  return (
    <tr className="transition-colors hover:bg-zinc-50">
      <td className="px-4 py-3">
        <Link href={`/admin/accounts/${row.authUserId}`} className="font-medium text-indigo-600 hover:underline">
          {title}
        </Link>
      </td>
      <td className="hidden px-4 py-3 font-mono text-xs text-zinc-400 md:table-cell">
        {row.authUserId}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <ProfileStateBadge state={row.profileState} />
          {row.isOrphaned && (
            <button
              type="button"
              onClick={() => onDeleteOrphan(row)}
              disabled={deleting}
              className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              title="Delete orphan profile"
            >
              {deleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Delete
            </button>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <BillingBadge status={row.billingStatus} />
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
        {row.ownedOrganizationsCount}
      </td>
      <td className="hidden px-4 py-3 text-right tabular-nums text-zinc-600 lg:table-cell">
        {row.locationsCount}
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-zinc-600">
        {row.employeesCount}
      </td>
      <td className="hidden px-4 py-3 text-xs text-zinc-500 lg:table-cell">
        {row.lastShiftCreatedAt ? formatRelative(row.lastShiftCreatedAt) : <span className="text-zinc-300">-</span>}
      </td>
    </tr>
  );
}

function ProfileStateBadge({ state }: { state: ProfileState }) {
  if (state === 'ok') {
    return (
      <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        OK
      </span>
    );
  }
  if (state === 'missing_name') {
    return (
      <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
        Missing name
      </span>
    );
  }
  return (
    <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      Orphaned
    </span>
  );
}

function BillingBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span role="status" aria-label="Billing status: None" className="inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-400">
        None
      </span>
    );
  }
  const colors =
    SUBSCRIPTION_STATUS_COLORS[status as SubscriptionStatusOption] ??
    'bg-zinc-100 text-zinc-600';
  const label =
    SUBSCRIPTION_STATUS_LABELS[status as SubscriptionStatusOption] ?? status;
  return (
    <span
      role="status"
      aria-label={`Billing status: ${label}`}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors}`}
    >
      {label}
    </span>
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

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1d ago';
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
