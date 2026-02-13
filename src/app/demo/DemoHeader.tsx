'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Calendar,
  Plus,
  Sun,
  Moon,
  BarChart3,
  Users,
  ClipboardList,
  Menu,
  X,
  MoreHorizontal,
} from 'lucide-react';
import Link from 'next/link';
import { useThemeStore } from '../../store/themeStore';
import { useUIStore } from '../../store/uiStore';
import { useDemoContext } from '../../demo/DemoProvider';

/**
 * Demo-specific header — same visual layout as the real Header but with
 * CrewShyft branding and no auth/billing items.
 */
export function DemoHeader() {
  const { theme, toggleTheme } = useThemeStore();
  const { toggleSidebar } = useUIStore();
  const demo = useDemoContext();

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [moreMenuPosition, setMoreMenuPosition] = useState({ top: 0, left: 0 });
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement>(null);

  // Close menu on outside click / Escape
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (moreMenuRef.current?.contains(target)) return;
      if (moreMenuButtonRef.current?.contains(target)) return;
      setMoreMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreMenuOpen]);

  // Position more-menu portal
  useEffect(() => {
    if (!moreMenuOpen) return;
    const updatePosition = () => {
      const button = moreMenuButtonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const menuWidth = 224;
      const margin = 8;
      let left = rect.right - menuWidth;
      if (left < margin) left = margin;
      const maxLeft = window.innerWidth - menuWidth - margin;
      if (left > maxLeft) left = maxLeft;
      setMoreMenuPosition({ top: rect.bottom + 8, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [moreMenuOpen]);

  const handleIntercept = (action: string) => {
    demo?.intercept(action);
    setMoreMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 h-14 sm:h-16 bg-theme-secondary border-b border-theme-primary transition-theme shrink-0">
      <div className="h-full px-2 sm:px-4 lg:px-6 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4 relative">
        {/* Left: Logo + sidebar toggle + nav */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          {/* Mobile sidebar toggle */}
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
            aria-label="Toggle staff sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-zinc-900" />
            </div>
            <span className="hidden sm:inline font-semibold text-theme-primary">CrewShyft</span>
          </div>

          {/* Primary nav */}
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              aria-label="Schedule"
            >
              <Calendar className="w-4 h-4" />
              <span className="hidden sm:inline">Schedule</span>
            </button>

            {/* Staff — intercepted */}
            <button
              onClick={() => handleIntercept('manage staff')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              aria-label="Staff"
            >
              <Users className="w-4 h-4" />
              <span className="hidden lg:inline">Staff</span>
            </button>

            {/* Requests — intercepted */}
            <button
              onClick={() => handleIntercept('review requests')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
              aria-label="Review Requests"
            >
              <ClipboardList className="w-4 h-4" />
              <span className="hidden lg:inline">Requests</span>
            </button>
          </nav>
        </div>

        {/* Center: Restaurant name */}
        <div className="flex items-center justify-center min-w-0">
          <span className="text-sm sm:text-base md:text-lg font-semibold text-theme-primary truncate max-w-[50vw] sm:max-w-[40vw]">
            Coastal Kitchen Demo
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0 w-full justify-end">
          {/* Add Shift — intercepted */}
          <button
            onClick={() => handleIntercept('add a shift')}
            className="inline-flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:shadow-lg text-sm font-medium"
            aria-label="Add Shift"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Shift</span>
          </button>

          {/* Reports — intercepted */}
          <button
            onClick={() => handleIntercept('view reports')}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors text-sm font-medium"
            aria-label="Reports"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden lg:inline">Reports</span>
          </button>

          {/* More menu */}
          <div className="relative">
            <button
              ref={moreMenuButtonRef}
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className="inline-flex items-center gap-1.5 p-2 rounded-lg bg-theme-tertiary text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
              aria-label="More options"
              aria-expanded={moreMenuOpen}
            >
              {moreMenuOpen ? <X className="w-5 h-5" /> : <MoreHorizontal className="w-5 h-5" />}
            </button>

            {moreMenuOpen &&
              typeof document !== 'undefined' &&
              createPortal(
                <div
                  ref={moreMenuRef}
                  className="w-56 bg-theme-secondary border border-theme-primary rounded-xl shadow-xl py-2 animate-slide-in"
                  style={{
                    position: 'fixed',
                    top: moreMenuPosition.top,
                    left: moreMenuPosition.left,
                    zIndex: 1100,
                  }}
                >
                  {/* Mobile-only nav items */}
                  <div className="sm:hidden border-b border-theme-primary pb-2 mb-2">
                    <button
                      onClick={() => handleIntercept('manage staff')}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <Users className="w-4 h-4" />
                      Staff
                    </button>
                    <button
                      onClick={() => handleIntercept('review requests')}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <ClipboardList className="w-4 h-4" />
                      Requests
                    </button>
                    <button
                      onClick={() => handleIntercept('view reports')}
                      className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                    >
                      <BarChart3 className="w-4 h-4" />
                      Reports
                    </button>
                  </div>

                  {/* Theme toggle */}
                  <button
                    onClick={() => {
                      toggleTheme();
                      setMoreMenuOpen(false);
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-theme-secondary hover:bg-theme-hover hover:text-theme-primary transition-colors"
                  >
                    {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    {theme === 'dark' ? 'Light Theme' : 'Dark Theme'}
                  </button>

                  {/* Get Started CTA in menu */}
                  <div className="border-t border-theme-primary pt-2 mt-2">
                    <Link
                      href="/start"
                      onClick={() => setMoreMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-amber-500 hover:bg-amber-500/10 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Get Started Free
                    </Link>
                  </div>
                </div>,
                document.body,
              )}
          </div>

          {/* Get Started CTA — always visible on desktop */}
          <Link
            href="/start"
            className="hidden sm:inline-flex items-center px-4 py-2 rounded-lg bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-sm font-semibold"
            data-analytics="demo_header_cta"
          >
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}
