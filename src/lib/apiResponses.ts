import { NextResponse } from 'next/server';

export type ApiErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN';

export function jsonError(message: string, status: number, code?: ApiErrorCode) {
  const resolvedCode =
    code ?? (status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : undefined);
  return NextResponse.json({ error: message, code: resolvedCode }, { status });
}
