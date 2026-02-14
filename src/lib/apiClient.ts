type ApiResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  code?: string;
  rawText?: string;
};

type ApiFetchOptions = RequestInit & {
  json?: unknown;
  skipAuthDebug?: boolean;
};

function normalizeApiUrl(input: string) {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('//')) {
    return trimmed;
  }

  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed;
  const isDev = process.env.NODE_ENV !== 'production';
  if (normalized.startsWith('/api/')) {
    return normalized;
  }

  if (normalized.startsWith('api/')) {
    const fixed = `/${normalized}`;
    if (isDev) {
       
      console.warn('[apiFetch] Normalized API path to include leading "/":', input, '->', fixed);
    }
    return fixed;
  }

  const fixed = normalized.startsWith('/') ? `/api${normalized}` : `/api/${normalized}`;
  if (isDev) {
     
    console.warn('[apiFetch] Normalized API path to include "/api/":', input, '->', fixed);
  }
  return fixed;
}

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

export async function apiFetch<T = unknown>(url: string, options: ApiFetchOptions = {}): Promise<ApiResult<T>> {
  const { json, skipAuthDebug, headers, ...rest } = options;
  const mergedHeaders = new Headers(headers);
  const requestUrl = normalizeApiUrl(url);

  let body = rest.body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!mergedHeaders.has('Content-Type')) {
      mergedHeaders.set('Content-Type', 'application/json');
    }
  }

  let response: Response;
  try {
    response = await fetch(requestUrl, {
      ...rest,
      headers: mergedHeaders,
      body,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      data: null,
      error: message,
    };
  }

  const { data, rawText } = await parseJsonSafe(response);
  const parsed = (data ?? null) as T | null;
  const error = response.ok ? undefined : data?.error || data?.message || rawText || response.statusText;
  const result: ApiResult<T> = {
    ok: response.ok,
    status: response.status,
    data: parsed,
    error,
    code: data?.code,
    rawText,
  };

  if (!response.ok && response.status === 401 && process.env.NODE_ENV !== 'production' && !skipAuthDebug) {
    try {
      const whoResponse = await fetch('/api/me', { credentials: 'include', cache: 'no-store' });
      const { data: whoData } = await parseJsonSafe(whoResponse);
      if (whoData?.hasSession) {
        const origin = typeof window !== 'undefined' ? window.location.origin : 'unknown';
         
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
