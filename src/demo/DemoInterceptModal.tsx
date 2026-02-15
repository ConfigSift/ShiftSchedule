'use client';

import { useCallback, useEffect, useRef } from 'react';
import { getAppBase, getIsLocalhost } from '@/lib/routing/getBaseUrls';

interface DemoInterceptModalProps {
  isOpen: boolean;
  action?: string;
  onClose: () => void;
}

export function DemoInterceptModal({ isOpen, action, onClose }: DemoInterceptModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  const handleGetStartedClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getAppBase(window.location.origin)}/start`);
  }, []);

  if (!isOpen) return null;

  const label = action ? `Want to ${action}?` : 'Like what you see?';

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-theme-primary bg-theme-secondary p-8 shadow-2xl transition-theme">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 rounded-lg p-1 text-theme-tertiary hover:text-theme-primary hover:bg-theme-hover transition-colors"
          aria-label="Close"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>

        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5Z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        <h2 className="text-center text-xl font-semibold text-theme-primary mb-2">{label}</h2>

        <p className="text-center text-theme-secondary text-sm leading-relaxed mb-7">
          Create your CrewShyft account to start building schedules, managing your team, and
          publishing shifts.
        </p>

        <a
          href="/start"
          onClick={handleGetStartedClick}
          className="block w-full rounded-xl bg-amber-500 py-3 text-center text-sm font-semibold text-zinc-900 hover:bg-amber-400 transition-colors"
          data-analytics="demo_intercept_cta"
        >
          Get Started
        </a>

        <button
          onClick={onClose}
          className="mt-3 block w-full rounded-xl border border-theme-primary bg-theme-tertiary py-3 text-center text-sm font-medium text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
        >
          Continue Exploring
        </button>
      </div>
    </div>
  );
}
