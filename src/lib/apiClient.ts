type ApiResult<T> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
  code?: string;
  rawText?: string;
};

type ApiFetchOptions = RequestInit & {
  json?: unknown;
  skipAuthDebug?: boolean;
};

async function parseJsonSafe(response: Response) {
  const text = await response.text();
  if (!text) {
    return { data: null, rawText: '' };
  }
  try {
    return { data: JSON.parse(text), rawText: text };
  } catch {
    return { data: null, rawText: text };
  }
}

export async function apiFetch<T = any>(url: string, options: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  const { json, skipAuthDebug, headers, ...rest } = options;
  const mergedHeaders = new Headers(headers);

  let body = rest.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!mergedHeaders.has('Content-Type')) {
      mergedHeaders.set('Content-Type', 'application/json');
    }
  }

  const response = await fetch(url, {
    ...rest,
    headers: mergedHeaders,
    body,
    credentials: 'include',
    cache: 'no-store',
  });

  const { data, rawText } = await parseJsonSafe(response);
  const result: ApiResult<T> = {
    ok: response.ok,
    status: response.status,
    data: data ?? undefined,
    error: response.ok ? undefined : data?.error || response.statusText,
    code: data?.code,
    rawText,
  };

  if (!response.ok && response.status === 401 && process.env.NODE_ENV !== 'production' && !skipAuthDebug) {
    try {
      const whoResponse = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
      const { data: whoData } = await parseJsonSafe(whoResponse);
      if (whoData?.hasSession) {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
        // eslint-disable-next-line no-console
        console.warn(
          '[auth-debug] /api/me reports a session but this request returned 401.',
          {
            url,
            origin,
            cookiePresent: whoData?.cookiePresent,
            authUserId: whoData?.authUserId,
            role: whoData?.role,
          }
        );
      }
    } catch {
      // ignore debug failures
    }
  }

  return result;
}
