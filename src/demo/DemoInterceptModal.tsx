'use client';

import { useCallback, useEffect, useRef } from 'react';

interface DemoInterceptModalProps {
  isOpen: boolean;
  action?: string;
  onClose: () => void;
}

/**
 * Modal shown when a demo user tries to perform a write action
 * (add shift, edit shift, publish, etc.).
 *
 * Matches the CrewShyft dark theme with amber accents.
 */
export function DemoInterceptModal({ isOpen, action, onClose }: DemoInterceptModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const label = action ? `Want to ${action}?` : 'Like what you see?';

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md mx-4 rounded-2xl border border-zinc-700/60 bg-zinc-900 p-8 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" />
            <line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        </button>

        {/* Icon */}
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

        {/* Title */}
        <h2 className="text-center text-xl font-semibold text-white mb-2">
          {label}
        </h2>

        {/* Description */}
        <p className="text-center text-zinc-400 text-sm leading-relaxed mb-7">
          Create your free CrewShyft account to start building schedules,
          managing your team, and publishing shifts.
        </p>

        {/* CTA */}
        <a
          href="/start"
          className="block w-full rounded-xl bg-amber-500 py-3 text-center text-sm font-semibold text-zinc-900 hover:bg-amber-400 transition-colors"
          data-analytics="demo_intercept_cta"
        >
          Get Started — It&apos;s Free
        </a>

        {/* Secondary */}
        <button
          onClick={onClose}
          className="mt-3 block w-full rounded-xl border border-zinc-700 py-3 text-center text-sm font-medium text-zinc-300 hover:bg-zinc-800 transition-colors"
        >
          Continue Exploring
        </button>
      </div>
    </div>
  );
}
