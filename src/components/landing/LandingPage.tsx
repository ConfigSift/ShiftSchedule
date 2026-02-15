'use client';

import { useCallback, useState, useRef, type ReactNode } from 'react';
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
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import { getAppBase, getIsLocalhost, getLoginBase } from '@/lib/routing/getBaseUrls';

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
const DATES = ['6', '7', '8', '9', '10', '11', '12'];

/* Job colors from jobColors.ts */
const JOB_STYLES: Record<string, { color: string; bg: string }> = {
  dishwasher: { color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.18)' },
  busser: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.18)' },
  server: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.18)' },
  cook: { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.18)' },
  host: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.18)' },
  bartender: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.18)' },
  manager: { color: '#84cc16', bg: 'rgba(132, 204, 22, 0.18)' },
};

/* Section colors for avatars from types/index.ts SECTIONS */
const AVATAR_STYLES: Record<string, { color: string; bg: string }> = {
  kitchen: { color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' },
  front: { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
  bar: { color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
  management: { color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' },
};

type MockShift = { day: number; time: string; job: string; draft?: boolean };

const MOCK_EMPLOYEES: { name: string; initials: string; jobKey: string; job: string; section: string; shifts: MockShift[] }[] = [
  { name: 'Alex P.', initials: 'AP', jobKey: 'dishwasher', job: 'Dishwasher', section: 'kitchen',
    shifts: [{ day: 0, time: '8a-4p', job: 'Dishwasher' }, { day: 1, time: '8a-4p', job: 'Dishwasher' }, { day: 3, time: '8a-4p', job: 'Dishwasher' }, { day: 4, time: '8a-4p', job: 'Dishwasher' }, { day: 5, time: '8a-4p', job: 'Dishwasher' }] },
  { name: 'Jordan T.', initials: 'JT', jobKey: 'busser', job: 'Busser', section: 'front',
    shifts: [{ day: 0, time: '4p-10p', job: 'Busser' }, { day: 2, time: '4p-10p', job: 'Busser' }, { day: 4, time: '4p-10p', job: 'Busser' }, { day: 6, time: '11a-7p', job: 'Busser' }] },
  { name: 'Sarah M.', initials: 'SM', jobKey: 'server', job: 'Server', section: 'front',
    shifts: [{ day: 0, time: '11a-7p', job: 'Server' }, { day: 2, time: '4p-11p', job: 'Server' }, { day: 4, time: '11a-7p', job: 'Server' }, { day: 5, time: '4p-11p', job: 'Server' }] },
  { name: 'James K.', initials: 'JK', jobKey: 'server', job: 'Server', section: 'front',
    shifts: [{ day: 1, time: '11a-7p', job: 'Server' }, { day: 3, time: '11a-7p', job: 'Server' }, { day: 5, time: '11a-7p', job: 'Server' }, { day: 6, time: '4p-11p', job: 'Server' }] },
  { name: 'Maria G.', initials: 'MG', jobKey: 'cook', job: 'Cook', section: 'kitchen',
    shifts: [{ day: 0, time: '6a-2p', job: 'Cook' }, { day: 1, time: '6a-2p', job: 'Cook' }, { day: 2, time: '6a-2p', job: 'Cook' }, { day: 4, time: '6a-2p', job: 'Cook' }, { day: 5, time: '6a-2p', job: 'Cook', draft: true }] },
  { name: 'Tyler R.', initials: 'TR', jobKey: 'cook', job: 'Cook', section: 'kitchen',
    shifts: [{ day: 1, time: '2p-10p', job: 'Cook' }, { day: 3, time: '2p-10p', job: 'Cook' }, { day: 5, time: '2p-10p', job: 'Cook', draft: true }, { day: 6, time: '2p-10p', job: 'Cook' }] },
  { name: 'Ashley W.', initials: 'AW', jobKey: 'host', job: 'Host', section: 'front',
    shifts: [{ day: 0, time: '4p-10p', job: 'Host' }, { day: 2, time: '4p-10p', job: 'Host' }, { day: 4, time: '4p-10p', job: 'Host' }, { day: 6, time: '4p-10p', job: 'Host' }] },
  { name: 'David L.', initials: 'DL', jobKey: 'bartender', job: 'Bartender', section: 'bar',
    shifts: [{ day: 1, time: '5p-1a', job: 'Bartender' }, { day: 3, time: '5p-1a', job: 'Bartender' }, { day: 5, time: '5p-1a', job: 'Bartender', draft: true }, { day: 6, time: '5p-1a', job: 'Bartender' }] },
  { name: 'Chris B.', initials: 'CB', jobKey: 'manager', job: 'Manager', section: 'management',
    shifts: [{ day: 0, time: '9a-5p', job: 'Manager' }, { day: 2, time: '9a-5p', job: 'Manager' }, { day: 4, time: '9a-5p', job: 'Manager' }] },
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
          app.crewshyft.com/dashboard
        </div>
      </div>

      {/* App header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-700 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Calendar className="w-3.5 h-3.5 text-zinc-900" />
          </div>
          <span className="font-semibold text-sm text-gray-900 dark:text-zinc-100 hidden sm:inline">CrewShyft</span>
          <div className="flex items-center gap-1 ml-2">
            <span className="px-2 py-1 rounded-md text-[10px] bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-zinc-400 font-medium">Schedule</span>
            <span className="px-2 py-1 rounded-md text-[10px] text-gray-400 dark:text-zinc-500 hidden sm:inline">Staff</span>
            <span className="px-2 py-1 rounded-md text-[10px] text-gray-400 dark:text-zinc-500 hidden sm:inline">Requests</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-1 rounded-lg text-[10px] text-gray-500 dark:text-zinc-400 hidden sm:inline">Shift Exchange</span>
          <span className="px-2.5 py-1 rounded-lg text-[10px] font-medium bg-amber-500 text-zinc-900">+ Add Shift</span>
        </div>
      </div>

      {/* Schedule toolbar */}
      <div className="bg-gray-50 dark:bg-zinc-800/50 border-b border-gray-200 dark:border-zinc-700 px-3 py-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-[10px]">&#8249;</div>
          <span className="text-[11px] font-semibold text-gray-900 dark:text-zinc-100 whitespace-nowrap">Jan 6 &ndash; 12, 2025</span>
          <div className="w-5 h-5 rounded flex items-center justify-center text-gray-400 dark:text-zinc-500 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-[10px]">&#8250;</div>
          <span className="px-1.5 py-0.5 rounded text-[9px] font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 hidden sm:inline">Today</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded overflow-hidden">
            <span className="px-2 py-0.5 text-[9px] text-gray-400 dark:text-zinc-500">Day</span>
            <span className="px-2 py-0.5 text-[9px] font-medium bg-amber-500 text-zinc-900">Week</span>
          </div>
          <span className="px-1.5 py-0.5 rounded-full text-[8px] font-semibold bg-amber-500/20 text-amber-600 dark:text-amber-400">DRAFT</span>
          <span className="px-2 py-1 rounded-lg text-[9px] font-semibold bg-amber-500 text-zinc-900 hidden sm:inline">Publish Week</span>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar: employee list with colored initials avatars */}
        <div className="w-28 sm:w-36 shrink-0 border-r border-gray-200 dark:border-zinc-700 bg-gray-50/50 dark:bg-zinc-800/30">
          {/* Status header cell (matches real app WeekView) */}
          <div className="h-[34px] border-b border-gray-200 dark:border-zinc-700 flex items-center justify-center bg-amber-500/15">
            <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">Draft</span>
          </div>
          {/* Employee rows */}
          {MOCK_EMPLOYEES.map((emp, i) => {
            const avatar = AVATAR_STYLES[emp.section] ?? AVATAR_STYLES.front;
            return (
              <div key={i} className="h-11 flex items-center gap-1.5 px-1.5 border-b border-gray-100 dark:border-zinc-800">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-semibold shrink-0"
                  style={{ backgroundColor: avatar.bg, color: avatar.color }}
                >
                  {emp.initials}
                </div>
                <span className="text-[10px] text-gray-700 dark:text-zinc-300 truncate leading-tight font-medium">{emp.name}</span>
              </div>
            );
          })}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-hidden">
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-gray-200 dark:border-zinc-700">
            {DAYS.map((day, i) => {
              const isWed = i === 2;
              return (
                <div key={day} className={`h-[34px] flex flex-col items-center justify-center text-center border-r border-gray-100 dark:border-zinc-800 last:border-r-0 ${isWed ? 'bg-amber-500/10' : ''}`}>
                  <span className={`text-[9px] font-medium ${isWed ? 'text-amber-500' : 'text-gray-500 dark:text-zinc-400'}`}>{day}</span>
                  <span className={`text-[10px] font-semibold ${isWed ? 'text-amber-500' : 'text-gray-700 dark:text-zinc-300'}`}>{DATES[i]}</span>
                </div>
              );
            })}
          </div>

          {/* Shift rows */}
          {MOCK_EMPLOYEES.map((emp, ri) => {
            const jobStyle = JOB_STYLES[emp.jobKey] ?? JOB_STYLES.server;
            return (
              <div key={ri} className="grid grid-cols-7 border-b border-gray-100 dark:border-zinc-800">
                {DAYS.map((_, di) => {
                  const shift = emp.shifts.find(s => s.day === di);
                  const isWed = di === 2;
                  return (
                    <div key={di} className={`h-11 p-0.5 border-r border-gray-50 dark:border-zinc-800/50 last:border-r-0 ${isWed ? 'bg-amber-500/5' : ''}`}>
                      {shift && (
                        <div
                          className={`h-full rounded px-1 py-0.5 flex flex-col justify-center overflow-hidden ${
                            shift.draft ? 'border border-dashed border-amber-400/60' : ''
                          }`}
                          style={{
                            backgroundColor: jobStyle.bg,
                            borderLeft: `2px solid ${jobStyle.color}`,
                            color: jobStyle.color,
                          }}
                        >
                          <span className="text-[8px] sm:text-[9px] font-medium leading-tight truncate">{shift.time}</span>
                          <span className="text-[7px] sm:text-[8px] leading-tight truncate opacity-70">{shift.job}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer stats (matches StatsFooter.tsx layout) */}
      <div className="bg-gray-50 dark:bg-zinc-800/50 border-t border-gray-200 dark:border-zinc-700 px-3 py-1.5 flex items-center justify-between text-[10px]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-gray-400 dark:text-zinc-500">Total Hours</span>
            <span className="font-semibold text-gray-700 dark:text-zinc-300">280h</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 dark:text-zinc-500">Staff</span>
            <span className="font-semibold text-gray-700 dark:text-zinc-300">9/12</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Section colored dots (matches real app StatsFooter) */}
          <div className="hidden sm:flex items-center gap-2">
            {[
              { key: 'kitchen', label: 'Kitchen', color: '#f97316' },
              { key: 'front', label: 'Front', color: '#3b82f6' },
              { key: 'bar', label: 'Bar', color: '#a855f7' },
              { key: 'mgmt', label: 'Mgmt', color: '#10b981' },
            ].map(s => (
              <div key={s.key} className="flex items-center gap-0.5">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[8px] text-gray-400 dark:text-zinc-500">{s.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-400 dark:text-zinc-500">Est. Labor</span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">$4,290</span>
          </div>
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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const handleSignInClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getLoginBase(window.location.origin)}/login`);
  }, []);

  const handleGetStartedClick = useCallback((event: React.MouseEvent<HTMLAnchorElement>) => {
    if (getIsLocalhost(window.location.host)) return;
    event.preventDefault();
    window.location.assign(`${getAppBase(window.location.origin)}/start`);
  }, []);

  const scrollTo = (id: string) => {
    setMobileMenuOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  const navLinks = [
    { label: 'Features', id: 'features' },
    { label: 'Demo', id: 'demo' },
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
            <span className="text-lg font-bold text-gray-900 dark:text-zinc-100">CrewShyft</span>
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
              onClick={handleSignInClick}
              className="hidden sm:inline-flex px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/start"
              onClick={handleGetStartedClick}
              className="hidden sm:inline-flex px-4 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors shadow-sm"
            >
              Get Started
            </Link>

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
                  onClick={handleSignInClick}
                  className="px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors text-center"
                >
                  Sign In
                </Link>
                <Link
                  href="/start"
                  onClick={handleGetStartedClick}
                  className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-center"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </nav>

      {/* ─── S2: Hero ─── */}
      <Section className="pt-24 sm:pt-28 pb-10 sm:pb-14 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-8">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 dark:text-zinc-100 mb-6">
              Restaurant Scheduling That{' '}
              <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">
                Actually Works
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-500 dark:text-zinc-400 max-w-2xl mx-auto">
              The only scheduling tool with a built-in shift marketplace that solves call-offs in minutes.
              Replace your $180/month tool with something your staff will actually use.
            </p>
          </div>

          {/* Desktop mockup */}
          <div className="max-w-4xl mx-auto mb-10">
            <div className="transform perspective-[2000px] rotate-x-1">
              <DesktopScheduleMockup />
            </div>
          </div>

          {/* Phone mockups */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-10">
            <PhoneMockup />
            <PhoneMockupExchange />
          </div>
        </div>
      </Section>

      {/* ─── S3: Pain Points ─── */}
      <Section id="pain-points" className="py-10 sm:py-16 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
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
      <Section id="marketplace" className="py-10 sm:py-16 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
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
      <Section id="features" className="py-10 sm:py-16 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
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
      <Section className="py-10 sm:py-16 px-4">
        <div className="max-w-4xl mx-auto flex flex-col lg:flex-row items-center gap-8">
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

      {/* ─── S6b: Demo CTA ─── */}
      <Section id="demo" className="py-12 sm:py-20 px-4">
        <div className="max-w-4xl mx-auto text-center" data-analytics="demo_cta_section">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
            See CrewShyft{' '}
            <span className="bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">in Action</span>
          </h2>
          <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto mb-8 text-base sm:text-lg">
            Explore a fully interactive demo with real scheduling data. No signup required.
          </p>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-all hover:shadow-lg hover:shadow-amber-500/25 mb-10"
            data-analytics="demo_landing_cta"
          >
            Try the Demo
            <ArrowRight className="w-5 h-5" />
          </Link>

          {/* Decorative browser frame preview */}
          <div className="max-w-3xl mx-auto">
            <div className="rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 shadow-2xl overflow-hidden">
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400/80" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
                  <div className="w-3 h-3 rounded-full bg-green-400/80" />
                </div>
                <div className="flex-1 mx-8">
                  <div className="h-6 rounded-md bg-gray-200 dark:bg-zinc-700 flex items-center px-3">
                    <span className="text-[10px] text-gray-400 dark:text-zinc-500 font-mono">app.crewshyft.com/dashboard</span>
                  </div>
                </div>
              </div>
              {/* Mock schedule grid */}
              <div className="p-4 sm:p-6">
                {/* Toolbar mock */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-7 w-16 rounded-md bg-amber-500/20 dark:bg-amber-500/10" />
                    <div className="h-7 w-16 rounded-md bg-gray-200 dark:bg-zinc-700" />
                  </div>
                  <div className="h-5 w-32 rounded bg-gray-200 dark:bg-zinc-700" />
                  <div className="hidden sm:flex items-center gap-2">
                    <div className="h-7 w-20 rounded-md bg-gray-200 dark:bg-zinc-700" />
                    <div className="h-7 w-7 rounded-md bg-amber-500/30" />
                  </div>
                </div>
                {/* Rows */}
                <div className="space-y-2">
                  {[
                    { name: 'w-20', shifts: [{ left: '5%', w: '25%', color: 'bg-blue-500/30 dark:bg-blue-500/20' }, { left: '55%', w: '20%', color: 'bg-blue-500/20 dark:bg-blue-500/15' }] },
                    { name: 'w-16', shifts: [{ left: '12%', w: '35%', color: 'bg-amber-500/30 dark:bg-amber-500/20' }] },
                    { name: 'w-24', shifts: [{ left: '40%', w: '30%', color: 'bg-purple-500/30 dark:bg-purple-500/20' }] },
                    { name: 'w-14', shifts: [{ left: '2%', w: '22%', color: 'bg-emerald-500/30 dark:bg-emerald-500/20' }, { left: '60%', w: '25%', color: 'bg-emerald-500/20 dark:bg-emerald-500/15' }] },
                    { name: 'w-20', shifts: [{ left: '30%', w: '40%', color: 'bg-red-500/25 dark:bg-red-500/15' }] },
                    { name: 'w-16', shifts: [{ left: '8%', w: '28%', color: 'bg-blue-500/25 dark:bg-blue-500/15' }] },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`h-4 ${row.name} rounded bg-gray-200 dark:bg-zinc-700 shrink-0`} />
                      <div className="flex-1 relative h-7 rounded bg-gray-100 dark:bg-zinc-800/50">
                        {row.shifts.map((shift, j) => (
                          <div
                            key={j}
                            className={`absolute top-0.5 bottom-0.5 rounded ${shift.color}`}
                            style={{ left: shift.left, width: shift.w }}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── S7: Competitive Comparison ─── */}
      <Section className="py-10 sm:py-16 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
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
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">CrewShyft</span>
                  </th>
                  <th className="py-4 px-3 text-center text-sm font-medium text-gray-500 dark:text-zinc-400">HotSchedules</th>
                  <th className="py-4 px-3 text-center text-sm font-medium text-gray-500 dark:text-zinc-400">7shifts</th>
                  <th className="py-4 px-3 text-center text-sm font-medium text-gray-500 dark:text-zinc-400">When I Work</th>
                </tr>
              </thead>
              <tbody>
                <CompRow label="Monthly Price" values={['$19.99/location', '$150-180', '$70-150', '$50-100']} />
                <CompRow label="Plan Model" values={['One simple plan', 'Tiered plans', 'Tiered plans', 'Tiered plans']} />
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
      <Section id="pricing" className="py-10 sm:py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-zinc-100 mb-4">
              Simple, Honest Pricing
            </h2>
            <p className="text-gray-500 dark:text-zinc-400 max-w-xl mx-auto">
              Save $130+/month vs HotSchedules. One simple plan, everything included.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="flex justify-center">
              <div className="inline-flex rounded-xl border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1">
                <button
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    billingCycle === 'monthly'
                      ? 'bg-amber-500 text-zinc-900'
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle('annual')}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    billingCycle === 'annual'
                      ? 'bg-amber-500 text-zinc-900'
                      : 'text-gray-600 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  Annual
                </button>
              </div>
            </div>

            <div className="mt-6 bg-white dark:bg-zinc-900 rounded-2xl border-2 border-amber-500 p-6 sm:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-zinc-100">CrewShyft Pro</h3>
                  <p className="text-sm text-gray-500 dark:text-zinc-400">One simple plan for every location.</p>
                </div>
                <span className="self-start px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-500/30">
                  per location
                </span>
              </div>

              <div className="mb-6">
                <div className="flex items-end gap-2">
                  <span className="text-5xl sm:text-6xl font-bold text-gray-900 dark:text-zinc-100">
                    {billingCycle === 'monthly' ? '$1' : '$199'}
                  </span>
                  <span className="text-gray-400 dark:text-zinc-500 pb-1">
                    {billingCycle === 'monthly' ? '/first month' : '/year per location'}
                  </span>
                </div>
                {billingCycle === 'monthly' ? (
                  <p className="mt-2 text-sm font-medium text-gray-700 dark:text-zinc-300">Then $19.99/mo per location</p>
                ) : (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      Save 17%
                    </span>
                  </div>
                )}
                <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
                  Billed per location. Add locations anytime in Site Manager.
                </p>
              </div>

              <ul className="space-y-2.5 mb-5">
                {[
                  'Schedule builder (day/week/month views)',
                  'Shift marketplace (drop & pick up shifts)',
                  'Team chat',
                  'Time-off requests',
                  'Blocked days management',
                  'Reports (Daily Roster, Daily Timeline, Weekly Schedule)',
                  'Multi-location support via Site Manager',
                  'Unlimited employees',
                  'Mobile-friendly access',
                ].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-gray-600 dark:text-zinc-400">
                    <Check className="w-4 h-4 text-amber-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mb-6 rounded-xl border border-gray-200 dark:border-zinc-700/70 bg-gray-50 dark:bg-zinc-900/70 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-zinc-500">Coming soon</p>
                <ul className="mt-2 space-y-1 text-xs text-gray-500 dark:text-zinc-500">
                  <li>• Clock-in/Clock-out with tablet kiosk mode</li>
                  <li>• Clock-in reports & analytics</li>
                </ul>
              </div>

              <Link
                href="/start"
                onClick={handleGetStartedClick}
                className="block w-full py-3 rounded-xl text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors text-center"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── S9: Testimonials ─── */}
      <Section id="testimonials" className="py-10 sm:py-16 px-4 bg-gray-50 dark:bg-zinc-900/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
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

      {/* ─── Footer ─── */}
      <footer className="border-t border-gray-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 py-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            {/* Brand */}
            <div className="col-span-2 md:col-span-1">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                  <Calendar className="w-4 h-4 text-zinc-900" />
                </div>
                <span className="font-bold text-gray-900 dark:text-zinc-100">CrewShyft</span>
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
              &copy; {new Date().getFullYear()} CrewShyft. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
