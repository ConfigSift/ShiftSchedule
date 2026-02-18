'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

type Props = {
  message?: string;
  detail?: string;
  onRetry?: () => void;
};

export function AdminFetchError({
  message = 'Failed to load data',
  detail,
  onRetry,
}: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-red-200 bg-red-50 py-16">
      <AlertTriangle className="h-8 w-8 text-red-400" />
      <div className="text-center">
        <p className="text-sm font-medium text-red-800">{message}</p>
        {detail && (
          <p className="mt-1 max-w-md text-xs text-red-600">{detail}</p>
        )}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}
