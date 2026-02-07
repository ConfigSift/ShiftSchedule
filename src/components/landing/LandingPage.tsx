'use client';

import { useState, useRef, type FormEvent, type ReactNode } from 'react';
import { motion, useInView } from 'framer-motion';
import { useThemeStore } from '../../store/themeStore';
import {
  Calendar,
  Sun,
  Moon,
  Menu,
  X,
  Check,
  DollarSign,
  PhoneOff,
  Frown,
  Bell,
  GripVertical,
  Smartphone,
  ArrowLeftRight,
  Users,
  CalendarOff,
  BarChart3,
  FileCheck,
  Star,
  ChevronRight,
  Clock,
} from 'lucide-react';
import Link from 'next/link';

/* ─── Scroll-animated section wrapper ─── */
function Section({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ─── Schedule data for mockups ─── */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DATES = ['Jan 6', 'Jan 7', 'Jan 8', 'Jan 9', 'Jan 10', 'Jan 11', 'Jan 12'];

const SCHEDULE_DATA = [
  { name: 'Sarah M.', role: 'Server', color: '#3b82f6', shifts: [{ day: 0, time: '11a-7p' }, { day: 2, time: '4p-11p' }, { day: 4, time: '11a-7p' }, { day: 5, time: '4p-11p' }] },
  { name: 'James K.', role: 'Server', color: '#3b82f6', shifts: [{ day: 1, time: '11a-7p' }, { day: 3, time: '11a-7p' }, { day: 5, time: '11a-7p' }, { day: 6, time: '4p-11p' }] },
  { name: 'Maria G.', role: 'Cook', color: '#ef4444', shifts: [{ day: 0, time: '6a-2p' }, { day: 1, time: '6a-2p' }, { day: 2, time: '6a-2p' }, { day: 4, time: '6a-2p' }, { day: 5, time: '6a-2p' }] },
  { name: 'Tyler R.', role: 'Cook', color: '#ef4444', shifts: [{ day: 1, time: '2p-10p' }, { day: 3, time: '2p-10p' }, { day: 5, time: '2p-10p', draft: true }, { day: 6, time: '2p-10p' }] },
  { name: 'Ashley W.', role: 'Host', color: '#10b981', shifts: [{ day: 0, time: '4p-10p' }, { day: 2, time: '4p-10p' }, { day: 4, time: '4p-10p' }, { day: 6, time: '4p-10p' }] },
  { name: 'David L.', role: 'Bartender', color: '#f97316', shifts: [{ day: 1, time: '5p-1a' }, { day: 3, time: '5p-1a' }, { day: 5, time: '5p-1a', draft: true }, { day: 6, time: '5p-1a' }] },
];

const ROLE_GROUPS = [
  { role: 'Server', color: '#3b82f6', count: 2 },
  { role: 'Cook', color: '#ef4444', count: 2 },
  { role: 'Host', color: '#10b981', count: 1 },
  { role: 'Bartender', color: '#f97316', count: 1 },
];

/* ─── Desktop Schedule Mockup ─── */
function DesktopScheduleMockup() {
  return (
    <div className="w-full rounded-2xl overflow-hidden shadow-2xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      {/* Browser chrome */}
      <div className="bg-gray-100 dark:bg-zinc-800 px-4 py-2.5 flex items-center gap-3 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <div className="w-3 h-3 rounded-full bg-yellow-400" />
          <div className="w-3 h-3 rounded-full bg-green-400" />
        </div>
        <div className="flex-1 bg-white dark:bg-zinc-700 rounded-lg px-3 py-1 text-xs text-gray-400 dark:text-zinc-400 truncate">
          app.shiftflow.com/dashboard
        </div>
      </div>

      {/* App header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-zinc-900" />
          </div>
          <span className="font-semibold text-sm text-gray-900 dark:text-zinc-100">ShiftFlow</span>
          <div className="flex items-center gap-1 ml-3">
            <span className="px-2 py-1 rounded-md text-xs bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400">Schedule</span>
            <span className="px-2 py-1 rounded-md text-xs text-gray-400 dark:text-zinc-500">Staff</span>
            <span className="px-2 py-1 rounded-md text-xs text-gray-400 dark:text-zinc-500">Requests</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-amber-500 text-zinc-900">+ Add Shift</span>
        </div>
      </div>

      {/* Week header */}
      <div className="bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Jan 6 – 12, 2025</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">DRAFT</span>
        </div>
        <span className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500 text-zinc-900">Publish Week</span>
      </div>

      <div className="flex">
        {/* Sidebar: role groups */}
        <div className="w-28 sm:w-36 shrink-0 border-r border-gray-200 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/30">
          {/* empty top-left cell */}
          <div className="h-8 border-b border-gray-200 dark:border-zinc-700" />
          {SCHEDULE_DATA.map((emp, i) => (
            <div key={i} className="h-10 flex items-center gap-1.5 px-2 border-b border-gray-100 dark:border-zinc-800">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: emp.color }} />
              <span className="text-[11px] text-gray-700 dark:text-zinc-300 truncate">{emp.name}</span>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-zinc-700">
            {DAYS.map((day, i) => (
              <div key={day} className="h-8 flex flex-col items-center justify-center text-center border-r border-gray-100 dark:border-zinc-800 last:border-r-0">
                <span className="text-[10px] font-medium text-gray-500 dark:text-zinc-400">{day}</span>
                <span className="text-[9px] text-gray-400 dark:text-zinc-500">{DATES[i]}</span>
              </div>
            ))}
          </div>

          {/* Shift rows */}
          {SCHEDULE_DATA.map((emp, ri) => (
            <div key={ri} className="grid grid-cols-7 border-b border-gray-100 dark:border-zinc-800">
              {DAYS.map((_, di) => {
                const shift = emp.shifts.find(s => s.day === di);
                return (
                  <div key={di} className="h-10 p-0.5 border-r border-gray-50 dark:border-zinc-800/50 last:border-r-0">
                    {shift && (
                      <div
                        className={`h-full rounded-md flex items-center justify-center text-white text-[10px] font-medium ${shift.draft ? 'border border-dashed' : ''}`}
                        style={{
                          background: shift.draft ? 'transparent' : emp.color + 'CC',
                          borderColor: shift.draft ? emp.color : undefined,
                          color: shift.draft ? emp.color : '#fff',
                        }}
                      >
                        {shift.time}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Footer stats */}
      <div className="bg-gray-50 dark:bg-zinc-800/50 border-t border-gray-200 dark:border-zinc-700 px-4 py-2 flex items-center gap-6 text-[11px]">
        <div>
          <span className="text-gray-400 dark:text-zinc-500">Total Hours</span>
          <span className="ml-1.5 font-semibold text-gray-700 dark:text-zinc-300">184h</span>
        </div>
        <div>
          <span className="text-gray-400 dark:text-zinc-500">Staff Working</span>
          <span className="ml-1.5 font-semibold text-gray-700 dark:text-zinc-300">6</span>
        </div>
        <div>
          <span className="text-gray-400 dark:text-zinc-500">Est. Labor</span>
          <span className="ml-1.5 font-semibold text-emerald-600 dark:text-emerald-400">$2,760</span>
        </div>
      </div>
    </div>
  );
}

/* ─── Phone Mockup (Employee Schedule) ─── */
function PhoneMockup() {
  const today = 2; // Wednesday active
  return (
    <div className="w-[220px] sm:w-[240px] mx-auto">
      <div className="relative rounded-[2rem] border-[3px] border-gray-800 dark:border-zinc-600 bg-white dark:bg-zinc-900 overflow-hidden shadow-xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-800 dark:bg-zinc-600 rounded-b-2xl z-10" />
        {/* Status bar */}
        <div className="h-10 bg-white dark:bg-zinc-900 flex items-end justify-between px-6 text-[9px] text-gray-400 dark:text-zinc-500">
          <span>9:41</span>
          <span>●●●</span>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Good Morning, Sarah!</p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">Here&apos;s your week at a glance</p>

          {/* Week dots */}
          <div className="flex justify-between mt-3 mb-3">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <span className="text-[9px] text-gray-400 dark:text-zinc-500">{d}</span>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium ${
                  i === today
                    ? 'bg-amber-500 text-white'
                    : [0, 2, 4, 5].includes(i)
                    ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400'
                    : 'text-gray-400 dark:text-zinc-500'
                }`}>
                  {6 + i}
                </div>
              </div>
            ))}
          </div>

          {/* Today's shift card */}
          <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-3 border border-gray-100 dark:border-zinc-700">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-1 h-8 rounded-full bg-blue-500" />
              <div>
                <p className="text-[11px] font-semibold text-gray-900 dark:text-zinc-100">Today — Wed, Jan 8</p>
                <p className="text-[10px] text-gray-500 dark:text-zinc-400">4:00 PM – 11:00 PM</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { label: 'Duration', value: '7h' },
                { label: 'Job', value: 'Server' },
                { label: 'Section', value: 'Patio' },
                { label: 'Location', value: 'Downtown' },
              ].map((item) => (
                <div key={item.label} className="bg-white dark:bg-zinc-700/50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-[8px] text-gray-400 dark:text-zinc-500 uppercase">{item.label}</p>
                  <p className="text-[10px] font-medium text-gray-700 dark:text-zinc-300">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Next shift */}
          <div className="mt-2 bg-gray-50 dark:bg-zinc-800 rounded-xl p-3 border border-gray-100 dark:border-zinc-700 opacity-60">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 rounded-full bg-blue-500" />
              <div>
                <p className="text-[10px] font-medium text-gray-700 dark:text-zinc-300">Fri, Jan 10</p>
                <p className="text-[9px] text-gray-400 dark:text-zinc-500">11:00 AM – 7:00 PM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-gray-100 dark:border-zinc-700 px-2 py-2 flex justify-around">
          {[
            { icon: Calendar, label: 'Schedule', active: true },
            { icon: ArrowLeftRight, label: 'Swap', active: false },
            { icon: CalendarOff, label: 'Time Off', active: false },
            { icon: Users, label: 'Chat', active: false },
          ].map(({ icon: Icon, label, active }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-500' : 'text-gray-300 dark:text-zinc-600'}`} />
              <span className={`text-[8px] ${active ? 'text-amber-500 font-medium' : 'text-gray-300 dark:text-zinc-600'}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-2">
          <div className="w-24 h-1 rounded-full bg-gray-200 dark:bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

/* ─── Phone Mockup (Shift Exchange) ─── */
function PhoneMockupExchange() {
  return (
    <div className="w-[220px] sm:w-[240px] mx-auto">
      <div className="relative rounded-[2rem] border-[3px] border-gray-800 dark:border-zinc-600 bg-white dark:bg-zinc-900 overflow-hidden shadow-xl">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-5 bg-gray-800 dark:bg-zinc-600 rounded-b-2xl z-10" />
        {/* Status bar */}
        <div className="h-10 bg-white dark:bg-zinc-900 flex items-end justify-between px-6 text-[9px] text-gray-400 dark:text-zinc-500">
          <span>9:41</span>
          <span>●●●</span>
        </div>

        {/* Content */}
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">Shift Exchange</p>
          <p className="text-[10px] text-gray-400 dark:text-zinc-500 mt-0.5">Find coverage or pick up shifts</p>

          {/* Tabs */}
          <div className="flex mt-3 mb-3 bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5">
            <div className="flex-1 py-1.5 rounded-md text-[10px] font-medium text-center bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm">
              My Shifts (Drop)
            </div>
            <div className="flex-1 py-1.5 rounded-md text-[10px] text-center text-gray-400 dark:text-zinc-500">
              Pick Up
            </div>
          </div>

          {/* Shift cards */}
          <div className="space-y-2">
            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-3 border border-gray-100 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-gray-900 dark:text-zinc-100">Sat, Jan 11</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">Server</span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-zinc-400 mb-2">4:00 PM – 11:00 PM · 7h</p>
              <button className="w-full py-1.5 rounded-lg text-[10px] font-medium bg-amber-500 text-zinc-900">
                Drop Shift
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-3 border border-gray-100 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-gray-900 dark:text-zinc-100">Sun, Jan 12</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400">Bartender</span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-zinc-400 mb-2">5:00 PM – 1:00 AM · 8h</p>
              <button className="w-full py-1.5 rounded-lg text-[10px] font-medium bg-emerald-500 text-white">
                Pick Up
              </button>
            </div>

            <div className="bg-gray-50 dark:bg-zinc-800 rounded-xl p-3 border border-gray-100 dark:border-zinc-700 opacity-60">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[11px] font-medium text-gray-900 dark:text-zinc-100">Mon, Jan 13</p>
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">Cook</span>
              </div>
              <p className="text-[10px] text-gray-500 dark:text-zinc-400">6:00 AM – 2:00 PM · 8h</p>
            </div>
          </div>
        </div>

        {/* Bottom nav */}
        <div className="border-t border-gray-100 dark:border-zinc-700 px-2 py-2 flex justify-around">
          {[
            { icon: Calendar, label: 'Schedule', active: false },
            { icon: ArrowLeftRight, label: 'Swap', active: true },
            { icon: CalendarOff, label: 'Time Off', active: false },
            { icon: Users, label: 'Chat', active: false },
          ].map(({ icon: Icon, label, active }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-500' : 'text-gray-300 dark:text-zinc-600'}`} />
              <span className={`text-[8px] ${active ? 'text-amber-500 font-medium' : 'text-gray-300 dark:text-zinc-600'}`}>{label}</span>
            </div>
          ))}
        </div>

        {/* Home indicator */}
        <div className="flex justify-center pb-2">
          <div className="w-24 h-1 rounded-full bg-gray-200 dark:bg-zinc-700" />
        </div>
      </div>
    </div>
  );
}

/* ─── Marketplace step mockup ─── */
function MarketplaceStep({ step, title, description, children }: { step: number; title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-full bg-amber-500 text-zinc-900 flex items-center justify-center text-lg font-bold mb-4">
        {step}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-zinc-400 mb-4">{description}</p>
      <div className="w-full max-w-[260px]">{children}</div>
    </div>
  );
}

/* ─── Feature card ─── */
function FeatureCard({ icon: Icon, title, description }: { icon: typeof Calendar; title: string; description: string }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-amber-500" />
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-zinc-100 mb-1">{title}</h3>
      <p className="text-sm text-gray-500 dark:text-zinc-400">{description}</p>
    </div>
  );
}

/* ─── Comparison table row ─── */
function CompRow({ label, values }: { label: string; values: (string | boolean)[] }) {
  return (
    <tr className="border-b border-gray-100 dark:border-zinc-800">
      <td className="py-3 px-3 text-sm font-medium text-gray-700 dark:text-zinc-300">{label}</td>
      {values.map((v, i) => (
        <td key={i} className={`py-3 px-3 text-sm text-center ${i === 0 ? 'bg-amber-50/50 dark:bg-amber-500/5' : ''}`}>
          {typeof v === 'boolean' ? (
            v ? <Check className="w-5 h-5 text-amber-500 mx-auto" /> : <X className="w-5 h-5 text-gray-300 dark:text-zinc-600 mx-auto" />
          ) : (
            <span className={`${i === 0 ? 'text-gray-900 dark:text-zinc-100 font-semibold' : 'text-gray-500 dark:text-zinc-400'}`}>{v}</span>
          )}
        </td>
      ))}
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN LANDING PAGE
   ═══════════════════════════════════════════════════════════ */
export function LandingPage() {
  const { theme, toggleTheme } = useThemeStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistName, setWaitlistName] = useState('');
  const [waitlistSize, setWaitlistSize] = useState('');
  const [heroEmail, setHeroEmail] = useState('');
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [heroSubmitState, setHeroSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleHeroSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!heroEmail) return;
    setHeroSubmitState('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: heroEmail }),
      });
      if (!res.ok) throw new Error();
      setHeroSubmitState('success');
      setHeroEmail('');
    } catch {
      setHeroSubmitState('error');
    }
  };

  const handleWaitlistSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;
    setSubmitState('loading');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: waitlistEmail,
          restaurant_name: waitlistName || undefined,
          employee_count: waitlistSize ? parseInt(waitlistSize) : undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setSubmitState('success');
      setWaitlistEmail('');
      setWaitlistName('');
      setWaitlistSize('');
    } catch {
      setSubmitState('error');
    }
  };

  const navLinks = [
    { label: 'Features', id: 'features' },
    { label: 'Pricing', id: 'pricing' },
    { label: 'Marketplace', id: 'marketplace' },
    { label: 'Testimonials', id: 'testimonials' },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-gray-900 dark:text-zinc-100 transition-colors">
      {/* ─── S1: Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
              <Calendar className="w-4.5 h-4.5 text-zinc-900" />
            </div>
            <span className="text-lg font-bold text-gray-900 dark:text-zinc-100">ShiftFlow</span>
          </div>

          {/* Center nav links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map(link => (
              <button
                key={link.id}
                onClick={() => scrollTo(link.id)}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
            <Link
              href="/login"
              className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Sign In
            </Link>
            <button
              onClick={() => scrollTo('waitlist')}
              className="hidden sm:inline-flex px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors shadow-sm"
            >
              Get Started Free
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden bg-white dark:bg-zinc-950 border-t border-gray-200 dark:border-zinc-800 overflow-hidden"
          >
            <div className="px-4 py-4 space-y-1">
              {navLinks.map(link => (
                <button
                  key={link.id}
                  onClick={() => scrollTo(link.id)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  {link.label}
                </button>
              ))}
              <div className="pt-2 flex flex-col gap-2">
                <Link
                  href="/login"
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-center"
                >
                  Sign In
                </Link>
                <button
                  onClick={() => scrollTo('waitlist')}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors"
                >
                  Get Started Free
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      {/* ─── S2: Hero ─── */}
      <Section className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-zinc-100 mb-6">
              Restaurant Scheduling That{' '}
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                Actually Works
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 dark:text-zinc-400 mb-8 max-w-2xl mx-auto">
              The only scheduling tool with a built-in shift marketplace that solves call-offs in minutes.
              Replace your $180/month tool with something your staff will actually use.
            </p>

            {/* Hero email form */}
            <form onSubmit={handleHeroSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-4">
              <input
                type="email"
                value={heroEmail}
                onChange={e => setHeroEmail(e.target.value)}
                placeholder="Enter your work email"
                required
                className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
              />
              <button
                type="submit"
                disabled={heroSubmitState === 'loading'}
                className="px-6 py-3 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm whitespace-nowrap"
              >
                {heroSubmitState === 'loading' ? 'Joining...' : heroSubmitState === 'success' ? 'You\'re In!' : 'Get Early Access'}
              </button>
            </form>
            {heroSubmitState === 'success' && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">Welcome aboard! We&apos;ll be in touch soon.</p>
            )}
            {heroSubmitState === 'error' && (
              <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
            )}
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-3">
              No credit card required &middot; Free forever plan &middot; Setup in 5 minutes
            </p>
          </div>

          {/* Desktop mockup */}
          <div className="max-w-4xl mx-auto mb-16">
            <div className="transform perspective-[2000px] rotate-x-1">
              <DesktopScheduleMockup />
            </div>
          </div>

          {/* Phone mockups */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12">
            <PhoneMockup />
            <PhoneMockupExchange />
          </div>
        </div>
      </Section>

      {/* ─── S3: Pain Points ─── */}
      <Section id="pain-points" className="py-16 sm:py-24 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Sound Familiar?
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
              Restaurant scheduling shouldn&apos;t be this painful. Here&apos;s what we hear every day.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: DollarSign,
                title: 'Overpaying for Bloated Tools',
                description: 'HotSchedules charges $150-180/month for features you don\'t use. That\'s $2,000+ per year going to waste.',
              },
              {
                icon: PhoneOff,
                title: 'Call-Offs With No Backup',
                description: 'Someone calls off and you\'re scrambling via group texts. Two hours later, you\'re still short-staffed.',
              },
              {
                icon: Frown,
                title: 'Staff Hates the App',
                description: 'Clunky interfaces and confusing UIs lead to missed shifts, miscommunication, and frustrated employees.',
              },
            ].map(({ icon: Icon, title, description }) => (
              <div key={title} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-amber-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-2">{title}</h3>
                <p className="text-sm text-gray-500 dark:text-zinc-400">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── S4: How the Shift Marketplace Works ─── */}
      <Section id="marketplace" className="py-16 sm:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              How the Shift Marketplace Works
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
              Fill call-offs in minutes, not hours. The feature HotSchedules doesn&apos;t have.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {/* Connector lines (hidden on mobile) */}
            <div className="hidden md:block absolute top-5 left-[calc(33.33%+20px)] right-[calc(33.33%+20px)] h-0.5 bg-amber-200 dark:bg-amber-500/20" />

            <MarketplaceStep
              step={1}
              title="Employee Calls Off"
              description="A notification is instantly sent to all eligible staff"
            >
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-3 shadow-sm">
                <div className="flex items-center gap-2 mb-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-gray-900 dark:text-zinc-100">New Notification</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400">Tyler R. can&apos;t make his shift on Sat, Jan 11 (2p-10p). This shift is now on the marketplace.</p>
              </div>
            </MarketplaceStep>

            <MarketplaceStep
              step={2}
              title="Shift Posted to Marketplace"
              description="Available staff see the open shift instantly"
            >
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-3 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-900 dark:text-zinc-100">Sat, Jan 11</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400">Cook</span>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 mb-2">2:00 PM – 10:00 PM · 8h</p>
                <div className="w-full py-1.5 rounded-lg text-[10px] font-medium text-center bg-emerald-500 text-white">Pick Up This Shift</div>
              </div>
            </MarketplaceStep>

            <MarketplaceStep
              step={3}
              title="Shift Covered!"
              description="Manager is notified, schedule is updated automatically"
            >
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-800 p-3 shadow-sm text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-2">
                  <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <p className="text-xs font-medium text-gray-900 dark:text-zinc-100">Shift Covered</p>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400">Maria G. picked up the Cook shift</p>
              </div>
            </MarketplaceStep>
          </div>
        </div>
      </Section>

      {/* ─── S5: Features ─── */}
      <Section id="features" className="py-16 sm:py-24 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Everything You Need to Run Your Schedule
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
              Built specifically for restaurants — not retro-fitted from generic scheduling software.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <FeatureCard icon={GripVertical} title="Drag & Drop Builder" description="Build schedules visually with drag-and-drop. Assign shifts in seconds." />
            <FeatureCard icon={Smartphone} title="Mobile-First Employee App" description="Staff check schedules, swap shifts, and request time off from their phone." />
            <FeatureCard icon={ArrowLeftRight} title="Shift Swap Marketplace" description="Real-time marketplace where staff pick up and drop shifts autonomously." />
            <FeatureCard icon={Bell} title="Instant Notifications" description="Push notifications for new schedules, swaps, approvals, and call-offs." />
            <FeatureCard icon={Users} title="Multi-Role Support" description="Server, Cook, Host, Bartender, Dishwasher, Manager — all color-coded." />
            <FeatureCard icon={CalendarOff} title="Time Off & Availability" description="Staff submit time-off requests. Managers approve or deny in one tap." />
            <FeatureCard icon={BarChart3} title="Labor Cost Tracking" description="See estimated labor costs per day, week, and role in real time." />
            <FeatureCard icon={FileCheck} title="Draft & Publish" description="Build drafts, review them, then publish to notify your entire team at once." />
          </div>
        </div>
      </Section>

      {/* ─── S6: Mobile Experience ─── */}
      <Section className="py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto flex flex-col lg:flex-row items-center gap-12">
          <div className="lg:w-1/2 text-center lg:text-left">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Your Staff Will Actually{' '}
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">Want</span>{' '}
              to Use This
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 mb-6">
              No more group texts. No more confusion. No more &quot;I didn&apos;t see the schedule.&quot;
              A clean, mobile-first app that your team will actually open.
            </p>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-zinc-400">
              {[
                'Check schedule anytime, anywhere',
                'Swap or drop shifts in 2 taps',
                'Get notified about new shifts instantly',
                'Request time off without texting the manager',
              ].map(item => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-amber-500 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="lg:w-1/2 flex justify-center">
            <PhoneMockup />
          </div>
        </div>
      </Section>

      {/* ─── S7: Competitive Comparison ─── */}
      <Section className="py-16 sm:py-24 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              How We Compare
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
              See why restaurants are switching from overpriced scheduling tools.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 overflow-hidden shadow-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-zinc-700">
                  <th className="py-4 px-3 text-left text-sm font-medium text-gray-500 dark:text-zinc-400" />
                  <th className="py-4 px-3 text-center bg-amber-50/50 dark:bg-amber-500/5">
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">ShiftFlow</span>
                  </th>
                  <th className="py-4 px-3 text-center text-sm font-medium text-gray-500 dark:text-zinc-400">HotSchedules</th>
                  <th className="py-4 px-3 text-center text-sm font-medium text-gray-500 dark:text-zinc-400">7shifts</th>
                  <th className="py-4 px-3 text-center text-sm font-medium text-gray-500 dark:text-zinc-400">When I Work</th>
                </tr>
              </thead>
              <tbody>
                <CompRow label="Monthly Price" values={['$0 – $49', '$150-180', '$70-150', '$50-100']} />
                <CompRow label="Free Tier" values={[true, false, true, false]} />
                <CompRow label="Shift Marketplace" values={[true, false, false, false]} />
                <CompRow label="Mobile App Quality" values={['Excellent', 'Poor', 'Good', 'Average']} />
                <CompRow label="Setup Time" values={['5 min', '2-3 hours', '1 hour', '30 min']} />
                <CompRow label="Labor Cost Tracking" values={[true, true, true, false]} />
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ─── S8: Pricing ─── */}
      <Section id="pricing" className="py-16 sm:py-24 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Simple, Honest Pricing
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
              Save $130+/month vs HotSchedules. Start free, upgrade when you&apos;re ready.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-1">Free</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-gray-900 dark:text-zinc-100">$0</span>
                <span className="text-gray-400 dark:text-zinc-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mb-6">Perfect for single-location restaurants getting started.</p>
              <ul className="space-y-2.5 mb-6">
                {[
                  'Single location',
                  'Up to 15 employees',
                  'Basic scheduling',
                  'Shift swaps',
                  'Mobile app access',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('waitlist')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-zinc-300 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Get Started Free
              </button>
            </div>

            {/* Pro */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border-2 border-amber-500 p-6 shadow-sm relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold bg-amber-500 text-zinc-900">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-zinc-100 mb-1">Pro</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold text-gray-900 dark:text-zinc-100">$49</span>
                <span className="text-gray-400 dark:text-zinc-500">/month</span>
              </div>
              <p className="text-sm text-gray-500 dark:text-zinc-400 mb-6">For growing restaurants that need the full power.</p>
              <ul className="space-y-2.5 mb-6">
                {[
                  'Unlimited employees',
                  'Shift marketplace',
                  'Multi-location support',
                  'Labor analytics & reports',
                  'Priority support',
                  'Custom roles & permissions',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('waitlist')}
                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── S9: Testimonials ─── */}
      <Section id="testimonials" className="py-16 sm:py-24 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              What Restaurant Teams Are Saying
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                quote: 'The shift marketplace is a game-changer. We used to spend 2 hours finding coverage for call-offs. Now it happens in 15 minutes without me lifting a finger.',
                name: 'Rachel P.',
                role: 'General Manager',
                place: 'Fast-casual chain, 3 locations',
                stars: 5,
              },
              {
                quote: 'We switched from HotSchedules and immediately saved $130/month. The app is cleaner, faster, and my staff actually checks it. Wish we switched sooner.',
                name: 'Marcus T.',
                role: 'Owner',
                place: 'Family-owned Italian restaurant',
                stars: 5,
              },
              {
                quote: 'My servers love the mobile app. They swap shifts themselves, request time off in the app, and I don\'t get 30 texts a day anymore. It\'s been a lifesaver.',
                name: 'Jennifer K.',
                role: 'Shift Manager',
                place: 'High-volume sports bar',
                stars: 5,
              },
            ].map(({ quote, name, role, place, stars }) => (
              <div key={name} className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-zinc-800 p-6 shadow-sm">
                <div className="flex gap-0.5 mb-3">
                  {Array.from({ length: stars }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-600 dark:text-zinc-400 mb-4 leading-relaxed">&quot;{quote}&quot;</p>
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">{name}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-500">{role}</p>
                  <p className="text-xs text-gray-400 dark:text-zinc-600">{place}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── S10: Waitlist CTA ─── */}
      <Section id="waitlist" className="py-16 sm:py-24 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 rounded-3xl border border-amber-200/50 dark:border-amber-500/10 p-8 sm:p-12 text-center">
            {submitState === 'success' ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', bounce: 0.4 }}
              >
                <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-zinc-100 mb-2">You&apos;re on the list!</h2>
                <p className="text-gray-500 dark:text-zinc-400">We&apos;ll reach out soon with early access. Thank you for joining ShiftFlow.</p>
              </motion.div>
            ) : (
              <>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
                  Ready to Fix Your Scheduling?
                </h2>
                <p className="text-gray-500 dark:text-zinc-400 mb-8 max-w-md mx-auto">
                  Join the waitlist and be the first to try ShiftFlow. Early adopters get free access forever.
                </p>

                <form onSubmit={handleWaitlistSubmit} className="space-y-3 max-w-sm mx-auto">
                  <input
                    type="email"
                    value={waitlistEmail}
                    onChange={e => setWaitlistEmail(e.target.value)}
                    placeholder="Work email"
                    required
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                  <input
                    type="text"
                    value={waitlistName}
                    onChange={e => setWaitlistName(e.target.value)}
                    placeholder="Restaurant name (optional)"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                  <input
                    type="number"
                    value={waitlistSize}
                    onChange={e => setWaitlistSize(e.target.value)}
                    placeholder="Number of employees (optional)"
                    min="1"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={submitState === 'loading'}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {submitState === 'loading' ? 'Joining...' : 'Join the Waitlist'}
                  </button>
                  {submitState === 'error' && (
                    <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
                  )}
                </form>
              </>
            )}
          </div>
        </div>
      </Section>

      {/* ─── S11: Footer ─── */}
      <footer className="border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-12 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-zinc-900" />
                </div>
                <span className="font-bold text-gray-900 dark:text-zinc-100">ShiftFlow</span>
              </div>
              <p className="text-xs text-gray-400 dark:text-zinc-500 leading-relaxed">
                Built for restaurants, by people who&apos;ve worked in them.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-semibold text-gray-900 dark:text-zinc-100 uppercase tracking-wider mb-3">Product</h4>
              <ul className="space-y-2">
                {['Features', 'Pricing', 'Marketplace', 'Mobile App'].map(item => (
                  <li key={item}>
                    <button onClick={() => scrollTo(item.toLowerCase().replace(' ', '-'))} className="text-sm text-gray-500 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors">
                      {item}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-xs font-semibold text-gray-900 dark:text-zinc-100 uppercase tracking-wider mb-3">Company</h4>
              <ul className="space-y-2">
                {['About', 'Blog', 'Careers', 'Contact'].map(item => (
                  <li key={item}>
                    <span className="text-sm text-gray-500 dark:text-zinc-400 cursor-default">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-semibold text-gray-900 dark:text-zinc-100 uppercase tracking-wider mb-3">Legal</h4>
              <ul className="space-y-2">
                {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map(item => (
                  <li key={item}>
                    <span className="text-sm text-gray-500 dark:text-zinc-400 cursor-default">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-zinc-800 pt-6 text-center">
            <p className="text-xs text-gray-400 dark:text-zinc-500">
              &copy; {new Date().getFullYear()} ShiftFlow. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
