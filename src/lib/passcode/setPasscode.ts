import { NextRequest, NextResponse } from 'next/server';
import { applySupabaseCookies, createSupabaseRouteClient } from '@/lib/supabase/route';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { jsonError } from '@/lib/apiResponses';
import { getUserRole } from '@/utils/role';
import { normalizePin } from '@/utils/pinNormalize';

const JSON_HINT =
  'Expected JSON like {"userId":"...","pinCode":"123456"}.\n' +
  'PowerShell (preferred):\n' +
  "$obj = @{ userId = \"...\"; pinCode = \"123456\" }\n" +
  'Invoke-RestMethod -Uri "http://localhost:3000/api/admin/set-passcode" -Method Post -ContentType "application/json" -Body ($obj | ConvertTo-Json)\n' +
  'curl.exe (stdin):\n' +
  'curl.exe -i -X POST "http://localhost:3000/api/admin/set-passcode" -H "Content-Type: application/json" -H "Authorization: Bearer <token>" --data-binary @-';

const POWERSHELL_CURL_HINT =
  'PowerShell curl.exe (stdin) example:\n' +
  "@'{\"userId\":\"...\",\"pinCode\":\"123456\"}'@ | curl.exe -i -X POST \"http://localhost:3000/api/admin/set-passcode\" -H \"Content-Type: application/json\" --data-binary @-\n";

type ParsedBody =
  | { ok: true; data: Record<string, unknown> }
  | {
      ok: false;
      status: number;
      error: string;
      hint: string;
      raw: string;
      debug?: { firstParseError?: string; buf?: Uint8Array };
    };

async function parseJsonBody(req: NextRequest): Promise<ParsedBody> {
  const arrayBuffer = await req.arrayBuffer();
  const buf = new Uint8Array(arrayBuffer);
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const raw = decoder.decode(buf);
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      ok: false,
      status: 400,
      error: 'JSON body required',
      hint: JSON_HINT,
      raw,
      debug: { firstParseError: 'Empty body', buf },
    };
  }

  let normalized = trimmed;
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }
  if (normalized.startsWith("'") && normalized.endsWith("'") && normalized.length >= 2) {
    normalized = normalized.slice(1, -1);
  }

  const parseObject = (value: unknown): Record<string, unknown> | unknown[] | null => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    if (Array.isArray(value)) {
      return value;
    }
    return value as Record<string, unknown>;
  };

  const tryParse = (
    value: string
  ):
    | { ok: true; data: Record<string, unknown> | unknown[] }
    | { ok: false; error: string; parseError?: string } => {
    try {
      let parsed: unknown = JSON.parse(value);
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed.trim());
      }
      const obj = parseObject(parsed);
      if (!obj) {
        return { ok: false, error: 'JSON body must be an object or array.' };
      }
      return { ok: true, data: obj };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Malformed JSON body.';
      return { ok: false, error: 'Malformed JSON body.', parseError: message };
    }
  };

  const firstAttempt = tryParse(normalized);
  if (firstAttempt.ok) {
    return { ok: true, data: firstAttempt.data };
  }
  if (firstAttempt.error === 'JSON body must be an object or array.') {
    return {
      ok: false,
      status: 400,
      error: 'JSON body must be an object or array.',
      hint: JSON_HINT,
      raw,
      debug: { firstParseError: firstAttempt.parseError ?? firstAttempt.error, buf },
    };
  }

  const fallbackAttempts: string[] = [];

  if (normalized.startsWith('"') && normalized.endsWith('"') && (normalized.includes('{') || normalized.includes('['))) {
    const stripped = normalized.slice(1, -1);
    fallbackAttempts.push(stripped);
    if (stripped.includes('\\"') || stripped.includes('\\\\\"')) {
      fallbackAttempts.push(
        stripped.replace(/\\\\\"/g, '\\"').replace(/\\"/g, '"')
      );
    }
  }

  if (
    (normalized.startsWith('{') || normalized.startsWith('[')) &&
    (normalized.includes('\\"') || normalized.includes('\\\\\"'))
  ) {
    const step1 = normalized.replace(/\\\\\"/g, '\\"');
    const step2 = step1.replace(/\\"/g, '"');
    if (step1 !== normalized) fallbackAttempts.push(step1);
    if (step2 !== normalized && step2 !== step1) fallbackAttempts.push(step2);
  }

  if (fallbackAttempts.length > 0) {
    for (const candidate of fallbackAttempts) {
      const attempt = tryParse(candidate);
      if (attempt.ok) {
        return { ok: true, data: attempt.data };
      }
      if (attempt.error === 'JSON body must be an object or array.') {
        return {
          ok: false,
          status: 400,
          error: 'JSON body must be an object or array.',
          hint: JSON_HINT,
          raw,
          debug: { firstParseError: firstAttempt.parseError ?? firstAttempt.error, buf },
        };
      }
    }
  }

  const strippedQuotesLikely =
    normalized.startsWith('{') &&
    normalized.endsWith('}') &&
    !normalized.includes('"') &&
    (normalized.includes('userId:') || normalized.includes('pinCode:'));

  return {
    ok: false,
    status: 400,
    error: strippedQuotesLikely
      ? 'Your client did not send JSON (quotes were stripped).'
      : 'Malformed JSON body. Send Content-Type: application/json and a JSON object like {"userId":"...","pinCode":"123456"}.',
    hint: strippedQuotesLikely ? `${POWERSHELL_CURL_HINT}${JSON_HINT}` : JSON_HINT,
    raw,
    debug: { firstParseError: firstAttempt.parseError ?? firstAttempt.error, buf },
  };
}

// Expected JSON body: { userId: "...", organizationId?: "...", pinCode?: "123456", passcode?: "123456" }
export async function setPasscodeHandler(req: NextRequest) {
  try {
    const { supabase, response } = createSupabaseRouteClient(req);
    const isDev = process.env.NODE_ENV !== 'production';
    const parsedBody = await parseJsonBody(req);
    if (!parsedBody.ok) {
      if (isDev) {
        const preview = parsedBody.raw.slice(0, 180);
        const codes = parsedBody.raw
          .slice(0, 60)
          .split('')
          .map((char) => char.charCodeAt(0))
          .join(',');
        const contentType = req.headers.get('content-type') ?? 'unknown';
        const contentLength = req.headers.get('content-length') ?? 'unknown';
        const escaped = JSON.stringify(parsedBody.raw);
        const hexPreview = parsedBody.debug?.buf
          ? Array.from(parsedBody.debug.buf.slice(0, 200))
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join(' ')
          : Array.from(Buffer.from(parsedBody.raw, 'utf8').slice(0, 200))
              .map((byte) => byte.toString(16).padStart(2, '0'))
              .join(' ');
        // eslint-disable-next-line no-console
        console.warn(
          '[set-passcode] JSON parse failed',
          parsedBody.error,
          parsedBody.debug?.firstParseError,
          contentType,
          parsedBody.raw.length,
          preview,
          codes,
          escaped,
          contentLength,
          hexPreview
        );
      }
      const contentType = req.headers.get('content-type') ?? 'unknown';
      const contentLength = req.headers.get('content-length') ?? 'unknown';
      const preview = parsedBody.raw.slice(0, 180);
      const codes = parsedBody.raw
        .slice(0, 60)
        .split('')
        .map((char) => char.charCodeAt(0))
        .join(',');
      const escaped = JSON.stringify(parsedBody.raw);
      const hexPreview = parsedBody.debug?.buf
        ? Array.from(parsedBody.debug.buf.slice(0, 200))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ')
        : Array.from(Buffer.from(parsedBody.raw, 'utf8').slice(0, 200))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ');
      const payload: Record<string, unknown> = {
        error: parsedBody.error,
        hint: parsedBody.hint,
      };
      if (isDev) {
        payload.debug = {
          contentType,
          contentLength,
          rawLength: parsedBody.raw.length,
          rawPreview: preview,
          rawJsonEscaped: escaped,
          charCodes: codes,
          hexPreview,
          firstParseError: parsedBody.debug?.firstParseError,
        };
      }
      return applySupabaseCookies(
        NextResponse.json(payload, { status: parsedBody.status }),
        response
      );
    }

    const payload = parsedBody.data as Record<string, unknown>;
    const userId = payload.userId;
    const passcode = payload.passcode;
    const pinCode = payload.pinCode;
    const organizationId = payload.organizationId;
    const pinValue = pinCode ?? passcode ?? '';

    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

    let normalizedPin: string;
    try {
      normalizedPin = normalizePin(String(pinValue));
    } catch {
      return applySupabaseCookies(
        NextResponse.json({ error: 'PIN must be 6 digits.' }, { status: 400 }),
        response
      );
    }

    const admin = supabaseAdmin;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const requesterAuthId = authData.user?.id;
    if (!requesterAuthId) {
      // Note: curl/Postman calls without a Supabase session cookie will return 401.
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Not signed in. Please sign out/in again.'
          : authError?.message || 'Unauthorized.';
      return applySupabaseCookies(jsonError(message, 401), response);
    }

    if (!userId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'User ID is required.', code: 'USER_ID_REQUIRED' }, { status: 400 }),
        response
      );
    }
    if (typeof userId !== 'string' || !isUuid(userId)) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'User ID must be a UUID.', code: 'INVALID_UUID' }, { status: 422 }),
        response
      );
    }
    if (!organizationId) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'Organization ID is required.', code: 'ORG_ID_REQUIRED' }, { status: 400 }),
        response
      );
    }
    if (typeof organizationId === 'string' && !isUuid(organizationId)) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'Organization ID must be a UUID.', code: 'INVALID_UUID' },
          { status: 422 }
        ),
        response
      );
    }
    if (typeof userId === 'string' && userId.includes('@')) {
      return applySupabaseCookies(
        NextResponse.json({ error: 'User ID must be a user UUID, not an email.', code: 'INVALID_USER_ID' }, { status: 400 }),
        response
      );
    }

    const { data: targetRow, error: targetError } = await admin
      .from('users')
      .select('id, organization_id, role, auth_user_id')
      .eq('id', String(userId))
      .eq('organization_id', String(organizationId))
      .maybeSingle();
    if (targetError || !targetRow) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: targetError?.message ?? 'User not found for org or invalid userId.', code: 'TARGET_NOT_FOUND' },
          { status: 404 }
        ),
        response
      );
    }

    const resolvedOrgId = String(organizationId);

    const { data: requesterMembership, error: requesterMembershipError } = await supabase
      .from('organization_memberships')
      .select('role')
      .eq('auth_user_id', requesterAuthId)
      .eq('organization_id', resolvedOrgId)
      .maybeSingle();

    if (requesterMembershipError || !requesterMembership) {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const requesterRole = String(requesterMembership.role ?? '').trim().toLowerCase();
    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      return applySupabaseCookies(jsonError('Insufficient permissions.', 403), response);
    }

    const targetRole = getUserRole(targetRow.role);
    if (requesterRole === 'manager' && targetRole === 'ADMIN') {
      return applySupabaseCookies(jsonError('Managers cannot reset admin PINs.', 403), response);
    }

    const targetAuthUserId = targetRow.auth_user_id ?? null;
    if (!targetAuthUserId) {
      return applySupabaseCookies(
        NextResponse.json(
          { error: 'User has no auth identity. Create/link auth first.', code: 'MISSING_AUTH_ID' },
          { status: 409 }
        ),
        response
      );
    }

    const { error: authUpdateError } = await admin.auth.admin.updateUserById(
      targetAuthUserId,
      { password: normalizedPin }
    );
    if (authUpdateError) {
      return applySupabaseCookies(
        NextResponse.json({ error: authUpdateError.message }, { status: 400 }),
        response
      );
    }
    const authPasswordUpdated = true;

    if (process.env.NODE_ENV !== 'production') {
      console.log('[set-passcode]', {
        userId: targetRow.id,
        organizationId: resolvedOrgId,
        didUpdateAuthPassword: authPasswordUpdated,
      });
    }

    return applySupabaseCookies(
      NextResponse.json({
        ok: true,
        authPasswordUpdated,
      }),
      response
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
