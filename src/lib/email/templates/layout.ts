type EmailLayoutInput = {
  title: string;
  paragraphs: string[];
  buttonText: string;
  buttonUrl: string;
  fallbackUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function renderCrewShyftEmailLayout(input: EmailLayoutInput): string {
  const title = escapeHtml(input.title);
  const buttonText = escapeHtml(input.buttonText);
  const buttonUrl = escapeHtml(input.buttonUrl);
  const fallbackUrl = escapeHtml(input.fallbackUrl);
  const paragraphHtml = input.paragraphs
    .map((paragraph) => `<p style="margin:0 0 14px 0;color:#374151;font-size:14px;line-height:1.6;">${escapeHtml(paragraph)}</p>`)
    .join('');

  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f6f7fb;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #e8eaf0;border-radius:16px;">
            <tr>
              <td style="padding:28px 28px 0 28px;">
                <div style="display:flex;align-items:center;gap:12px;margin:0 0 20px 0;">
                  <div style="width:44px;height:44px;border-radius:12px;background:#f59e0b;color:#111827;font-weight:700;font-size:22px;line-height:44px;text-align:center;">&#x1F4C5;</div>
                  <div>
                    <div style="font-size:18px;line-height:1.2;font-weight:700;color:#111827;">CrewShyft</div>
                    <div style="font-size:13px;line-height:1.4;color:#6b7280;">Shift scheduling for restaurant teams</div>
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 16px 28px;">
                <h1 style="margin:0 0 14px 0;font-size:22px;line-height:1.3;color:#111827;font-weight:700;">${title}</h1>
                ${paragraphHtml}
                <div style="margin:20px 0 12px 0;">
                  <a href="${buttonUrl}" style="display:inline-block;background:#f59e0b;color:#111827;text-decoration:none;font-weight:700;font-size:14px;line-height:1;padding:12px 16px;border-radius:12px;">${buttonText}</a>
                </div>
                <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.5;">
                  If the button does not work, use this link:
                  <a href="${fallbackUrl}" style="color:#111827;word-break:break-all;text-decoration:underline;">${fallbackUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 28px 24px 28px;border-top:1px solid #e8eaf0;color:#9ca3af;font-size:12px;line-height:1.5;">
                This message was sent by CrewShyft. You received this email because your schedule was updated.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

