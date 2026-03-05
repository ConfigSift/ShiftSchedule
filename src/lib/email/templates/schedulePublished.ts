import { formatEmailDate } from '@/lib/email/format';
import { renderCrewShyftEmailLayout } from '@/lib/email/templates/layout';

type SchedulePublishedMode = 'all' | 'changed';

type RenderSchedulePublishedEmailInput = {
  restaurantName: string;
  scope: string;
  rangeStart: string | number | Date;
  rangeEnd: string | number | Date;
  mode: SchedulePublishedMode;
  loginUrl: string;
};

type RenderSchedulePublishedEmailResult = {
  subject: string;
  html: string;
  text: string;
};

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function renderSchedulePublishedEmail(
  input: RenderSchedulePublishedEmailInput,
): RenderSchedulePublishedEmailResult {
  const rangeStartLabel = formatEmailDate(input.rangeStart);
  const rangeEndLabel = formatEmailDate(input.rangeEnd);
  const rangeLabel = [rangeStartLabel, rangeEndLabel].filter(Boolean).join(' - ');
  const normalizedLoginBase = trimTrailingSlash(String(input.loginUrl ?? '').trim());
  const ctaUrl = `${normalizedLoginBase}/login`;

  const subject =
    input.mode === 'changed'
      ? `Your schedule was updated - ${input.restaurantName}`
      : `Schedule published - ${input.restaurantName}`;

  const scopeLabel = String(input.scope ?? '').trim();
  const scopeLine = scopeLabel ? `Scope: ${scopeLabel}.` : '';
  const paragraphs = [
    `Hi there, ${input.restaurantName} just published updates to the schedule.`,
    `${scopeLine} ${rangeLabel ? `Date range: ${rangeLabel}.` : ''}`.trim(),
    input.mode === 'changed'
      ? 'Only shifts that changed were republished.'
      : 'All shifts in this range are now live.',
  ];

  const html = renderCrewShyftEmailLayout({
    title: input.mode === 'changed' ? 'Your schedule was updated' : 'Schedule published',
    paragraphs,
    buttonText: 'View Schedule',
    buttonUrl: ctaUrl,
    fallbackUrl: ctaUrl,
  });

  const text = [
    subject,
    '',
    ...paragraphs,
    '',
    `View Schedule: ${ctaUrl}`,
  ].join('\n');

  return {
    subject,
    html,
    text,
  };
}

