'use client';

import { useState, useRef, FormEvent } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  CalendarDays, ArrowRight, Clock, DollarSign, Users, Smartphone,
  Bell, Briefcase, ClipboardList, RefreshCw, CheckCircle2, XCircle,
  ChevronRight, Zap, Shield, Star, ArrowUpRight, Menu, X,
  Phone, AlertTriangle, UserCheck, Check, Minus,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
/* ------------------------------------------------------------------ */

function Section({ children, className = '', id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.section
      id={id}
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

/* ------------------------------------------------------------------ */
/*  Animated Schedule Mock                                             */
/* ------------------------------------------------------------------ */

function ScheduleMock() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const shifts = [
    { day: 0, row: 0, label: 'Sarah K.', time: '9a-3p', color: 'bg-emerald-500/80', delay: 0.2 },
    { day: 1, row: 1, label: 'Mike R.', time: '11a-7p', color: 'bg-sky-500/80', delay: 0.4 },
    { day: 2, row: 0, label: 'Jess L.', time: '5p-11p', color: 'bg-violet-500/80', delay: 0.6 },
    { day: 3, row: 2, label: 'Carlos M.', time: '10a-4p', color: 'bg-amber-500/80', delay: 0.8 },
    { day: 4, row: 1, label: 'Anna T.', time: '3p-9p', color: 'bg-rose-500/80', delay: 1.0 },
    { day: 5, row: 0, label: 'David W.', time: '8a-2p', color: 'bg-emerald-500/80', delay: 1.2 },
    { day: 5, row: 2, label: 'Kim P.', time: '4p-12a', color: 'bg-sky-500/80', delay: 1.4 },
    { day: 6, row: 1, label: 'Open', time: '11a-7p', color: 'bg-zinc-600 border border-dashed border-zinc-500', delay: 1.6 },
  ];

  return (
    <div className="relative w-full max-w-lg mx-auto">
      {/* Glow effect */}
      <div className="absolute -inset-4 bg-gradient-to-br from-emerald-500/10 via-transparent to-sky-500/10 rounded-3xl blur-2xl" />

      <div className="relative bg-zinc-900/80 border border-zinc-800 rounded-2xl p-4 backdrop-blur-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">Week of Jan 13</span>
          <span className="text-[10px] text-emerald-400 font-medium">Published</span>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {days.map((d) => (
            <div key={d} className="text-center text-[10px] font-medium text-zinc-500 py-1">{d}</div>
          ))}
        </div>

        {/* Grid */}
        {[0, 1, 2].map((row) => (
          <div key={row} className="grid grid-cols-7 gap-1 mb-1">
            {days.map((_, dayIdx) => {
              const shift = shifts.find((s) => s.day === dayIdx && s.row === row);
              if (!shift) return <div key={dayIdx} className="h-12 rounded-lg bg-zinc-800/40" />;
              return (
                <motion.div
                  key={dayIdx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: shift.delay, duration: 0.4, ease: 'easeOut' }}
                  className={`h-12 rounded-lg ${shift.color} flex flex-col items-center justify-center cursor-default`}
                >
                  <span className="text-[9px] font-semibold text-white leading-tight">{shift.label}</span>
                  <span className="text-[8px] text-white/70">{shift.time}</span>
                </motion.div>
              );
            })}
          </div>
        ))}

        {/* Marketplace notification */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 2.2, duration: 0.5 }}
          className="absolute -right-3 top-24 sm:-right-6 bg-zinc-800 border border-emerald-500/40 rounded-xl p-3 shadow-lg shadow-emerald-500/10 max-w-[180px]"
        >
          <div className="flex items-center gap-2 mb-1">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <Zap className="w-3 h-3 text-emerald-400" />
            </div>
            <span className="text-[10px] font-semibold text-emerald-400">Shift Filled!</span>
          </div>
          <p className="text-[9px] text-zinc-400">Sun 11a-7p claimed by Alex R. from Bistro 42</p>
        </motion.div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Phone Mockup                                                       */
/* ------------------------------------------------------------------ */

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[260px] sm:w-[280px]">
      {/* Phone frame */}
      <div className="relative bg-zinc-900 rounded-[2.5rem] p-2 border-2 border-zinc-700 shadow-2xl shadow-black/50">
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-6 bg-zinc-900 rounded-b-2xl z-10" />

        {/* Screen */}
        <div className="bg-zinc-950 rounded-[2rem] overflow-hidden pt-8">
          {/* Status bar */}
          <div className="flex items-center justify-between px-5 py-1 text-[9px] text-zinc-500">
            <span>9:41</span>
            <div className="flex items-center gap-1">
              <div className="w-3 h-1.5 border border-zinc-500 rounded-sm"><div className="w-2 h-full bg-emerald-400 rounded-sm" /></div>
            </div>
          </div>

          {/* App header */}
          <div className="px-4 pt-2 pb-3">
            <h3 className="text-sm font-bold text-white">My Schedule</h3>
            <p className="text-[10px] text-zinc-500">This Week</p>
          </div>

          {/* Schedule items */}
          <div className="px-3 space-y-2 pb-2">
            {[
              { day: 'Today', time: '11:00 AM - 7:00 PM', role: 'Server', color: 'bg-sky-500' },
              { day: 'Tomorrow', time: '5:00 PM - 11:00 PM', role: 'Bartender', color: 'bg-amber-500' },
              { day: 'Thursday', time: '9:00 AM - 3:00 PM', role: 'Server', color: 'bg-sky-500' },
            ].map((shift, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.15 }}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-white">{shift.day}</span>
                  <span className={`text-[9px] px-2 py-0.5 rounded-full ${shift.color}/20 text-white font-medium`}>{shift.role}</span>
                </div>
                <span className="text-[10px] text-zinc-400">{shift.time}</span>
              </motion.div>
            ))}
          </div>

          {/* Open shifts */}
          <div className="px-3 pb-3">
            <p className="text-[10px] font-semibold text-emerald-400 mb-2 px-1">2 Open Shifts Near You</p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-white">Fri, Server</p>
                  <p className="text-[9px] text-zinc-400">The Olive Branch - 0.3 mi</p>
                </div>
                <div className="px-2 py-1 bg-emerald-500 rounded-lg text-[9px] font-bold text-white">Pick Up</div>
              </div>
            </motion.div>
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around py-2 border-t border-zinc-800 bg-zinc-900/50">
            {[
              { icon: CalendarDays, label: 'Schedule', active: true },
              { icon: RefreshCw, label: 'Swap', active: false },
              { icon: Bell, label: 'Alerts', active: false },
              { icon: Users, label: 'Profile', active: false },
            ].map(({ icon: Icon, label, active }) => (
              <div key={label} className="flex flex-col items-center gap-0.5">
                <Icon className={`w-4 h-4 ${active ? 'text-emerald-400' : 'text-zinc-600'}`} />
                <span className={`text-[8px] ${active ? 'text-emerald-400' : 'text-zinc-600'}`}>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const [email, setEmail] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [employeeCount, setEmployeeCount] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [heroEmail, setHeroEmail] = useState('');
  const [heroSubmitted, setHeroSubmitted] = useState(false);
  const [heroSubmitting, setHeroSubmitting] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  const handleHeroSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!heroEmail.trim() || heroSubmitting) return;
    setHeroSubmitting(true);
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: heroEmail }),
      });
      setHeroSubmitted(true);
    } catch { /* ignore */ }
    setHeroSubmitting(false);
  };

  const handleWaitlistSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || submitting) return;
    setSubmitting(true);
    try {
      await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          restaurant_name: restaurantName || undefined,
          employee_count: employeeCount ? parseInt(employeeCount) : undefined,
        }),
      });
      setSubmitted(true);
    } catch { /* ignore */ }
    setSubmitting(false);
  };

  const scrollTo = (id: string) => {
    setMobileNav(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-emerald-500/30 selection:text-white">
      {/* ========== NAVBAR ========== */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/80 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
              <CalendarDays className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">ShiftSchedule</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8 text-sm text-zinc-400">
            <button onClick={() => scrollTo('features')} className="hover:text-white transition-colors">Features</button>
            <button onClick={() => scrollTo('marketplace')} className="hover:text-white transition-colors">Marketplace</button>
            <button onClick={() => scrollTo('pricing')} className="hover:text-white transition-colors">Pricing</button>
            <button
              onClick={() => scrollTo('waitlist')}
              className="px-4 py-2 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-400 transition-colors"
            >
              Get Early Access
            </button>
          </div>

          {/* Mobile menu toggle */}
          <button onClick={() => setMobileNav(!mobileNav)} className="md:hidden p-2 text-zinc-400 hover:text-white">
            {mobileNav ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile dropdown */}
        {mobileNav && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="md:hidden border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-xl"
          >
            <div className="px-4 py-4 space-y-3">
              <button onClick={() => scrollTo('features')} className="block text-sm text-zinc-400 hover:text-white w-full text-left py-2">Features</button>
              <button onClick={() => scrollTo('marketplace')} className="block text-sm text-zinc-400 hover:text-white w-full text-left py-2">Marketplace</button>
              <button onClick={() => scrollTo('pricing')} className="block text-sm text-zinc-400 hover:text-white w-full text-left py-2">Pricing</button>
              <button
                onClick={() => scrollTo('waitlist')}
                className="w-full px-4 py-2.5 bg-emerald-500 text-white text-sm font-semibold rounded-lg hover:bg-emerald-400"
              >
                Get Early Access
              </button>
            </div>
          </motion.div>
        )}
      </nav>

      {/* ========== 1. HERO ========== */}
      <section className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 overflow-hidden">
        {/* BG gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-sky-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — copy */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
              >
                <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-medium text-emerald-400 mb-6">
                  <Zap className="w-3 h-3" /> Now accepting early access signups
                </span>
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1] mb-5"
              >
                Stop Overpaying for Restaurant{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-sky-400 bg-clip-text text-transparent">Scheduling</span>
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-lg text-zinc-400 mb-8 max-w-lg leading-relaxed"
              >
                The only scheduling platform with a cross-restaurant shift marketplace. When someone calls off, get their shift filled in minutes — not hours of frantic phone calls.
              </motion.p>

              {/* Email capture */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
              >
                {!heroSubmitted ? (
                  <form onSubmit={handleHeroSubmit} className="flex flex-col sm:flex-row gap-3 max-w-md">
                    <input
                      type="email"
                      required
                      placeholder="you@restaurant.com"
                      value={heroEmail}
                      onChange={(e) => setHeroEmail(e.target.value)}
                      className="flex-1 px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                    />
                    <button
                      type="submit"
                      disabled={heroSubmitting}
                      className="px-6 py-3 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
                    >
                      {heroSubmitting ? 'Joining...' : 'Start Scheduling Free'}
                      {!heroSubmitting && <ArrowRight className="w-4 h-4" />}
                    </button>
                  </form>
                ) : (
                  <div className="flex items-center gap-2 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-5 h-5" />
                    You&apos;re on the list! We&apos;ll be in touch soon.
                  </div>
                )}

                {/* Trust indicators */}
                <div className="flex flex-wrap items-center gap-4 mt-5 text-xs text-zinc-500">
                  <span className="flex items-center gap-1"><Shield className="w-3 h-3" /> No credit card required</span>
                  <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Free forever plan</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Setup in 5 minutes</span>
                </div>
              </motion.div>
            </div>

            {/* Right — animated schedule */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="hidden lg:block"
            >
              <ScheduleMock />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ========== 2. PAIN POINTS ========== */}
      <Section id="problems" className="py-20 sm:py-28 border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Sound Familiar?</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">Three problems every restaurant owner deals with — and pretends are just &quot;part of the business.&quot;</p>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
            className="grid md:grid-cols-3 gap-6"
          >
            {[
              {
                icon: DollarSign,
                color: 'text-rose-400',
                bg: 'bg-rose-500/10 border-rose-500/20',
                title: '$180/month for scheduling?',
                description: 'HotSchedules and 7shifts charge per-location fees that add up fast. You\'re paying enterprise prices for a basic need.',
              },
              {
                icon: AlertTriangle,
                color: 'text-amber-400',
                bg: 'bg-amber-500/10 border-amber-500/20',
                title: 'Call-offs with no backup plan',
                description: 'Someone texts "can\'t make it" at 4 AM. Now you\'re calling through your entire roster hoping someone picks up.',
              },
              {
                icon: Phone,
                color: 'text-sky-400',
                bg: 'bg-sky-500/10 border-sky-500/20',
                title: 'Staff won\'t use the app',
                description: 'Clunky interfaces from 2012 mean your team ignores the schedule. Cue the "I didn\'t see it" excuses and no-shows.',
              },
            ].map((pain, i) => (
              <motion.div key={i} variants={fadeUp} className={`${pain.bg} border rounded-2xl p-6`}>
                <pain.icon className={`w-8 h-8 ${pain.color} mb-4`} />
                <h3 className="font-bold text-lg mb-2">{pain.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{pain.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ========== 3. HOW THE MARKETPLACE WORKS ========== */}
      <Section id="marketplace" className="py-20 sm:py-28 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-xs font-medium text-emerald-400 mb-4">
              The feature HotSchedules doesn&apos;t have
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">The Shift Marketplace</h2>
            <p className="text-zinc-400 max-w-2xl mx-auto">When someone calls off, their shift gets posted to a network of verified workers at nearby restaurants. No more frantic phone calls — coverage finds you.</p>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid md:grid-cols-3 gap-6 mt-14"
          >
            {[
              {
                step: '01',
                icon: Phone,
                title: 'Employee calls off',
                description: 'A shift opens up at your restaurant. Instead of panicking, the system kicks in automatically.',
                accent: 'from-rose-500 to-rose-600',
              },
              {
                step: '02',
                icon: Users,
                title: 'Marketplace activates',
                description: 'The open shift is instantly visible to verified, qualified workers at partner restaurants in your area.',
                accent: 'from-amber-500 to-amber-600',
              },
              {
                step: '03',
                icon: CheckCircle2,
                title: 'Shift filled in minutes',
                description: 'A verified worker claims the shift. You get notified. Done. No phone calls, no stress.',
                accent: 'from-emerald-500 to-emerald-600',
              },
            ].map((step, i) => (
              <motion.div key={i} variants={fadeUp} className="relative">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 h-full">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${step.accent} flex items-center justify-center mb-4`}>
                    <step.icon className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-[11px] font-bold text-zinc-600 tracking-wider uppercase mb-2 block">Step {step.step}</span>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{step.description}</p>
                </div>
                {/* Connector arrow */}
                {i < 2 && (
                  <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
                    <ChevronRight className="w-6 h-6 text-zinc-700" />
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ========== 4. FEATURES ========== */}
      <Section id="features" className="py-20 sm:py-28 border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything You Need to Run Shifts</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">Modern scheduling that your team will actually use — not fight against.</p>
          </div>

          <motion.div
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-60px' }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {[
              { icon: CalendarDays, title: 'Drag-and-drop schedule builder', description: 'Build a full week in minutes. Copy schedules, auto-fill from templates, bulk edit shifts.' },
              { icon: Smartphone, title: 'Mobile-first design', description: 'An interface employees actually want to use. View schedules, swap shifts, request time off — all from their phone.' },
              { icon: RefreshCw, title: 'Shift marketplace', description: 'Cross-restaurant shift coverage. Fill call-offs with verified workers from nearby partner restaurants.' },
              { icon: Bell, title: 'Instant notifications', description: 'Push notifications for schedule changes, new open shifts, approved swaps, and time-off updates.' },
              { icon: Briefcase, title: 'Multi-job support', description: 'Employees with multiple roles? Track certifications, cross-train positions, and schedule by skill.' },
              { icon: ClipboardList, title: 'Availability & time-off', description: 'Staff set their availability. Managers approve time-off requests. No more back-and-forth texting.' },
            ].map((feature, i) => (
              <motion.div key={i} variants={fadeUp} className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:border-zinc-700 transition-colors">
                <feature.icon className="w-6 h-6 text-emerald-400 mb-3" />
                <h3 className="font-semibold mb-1.5">{feature.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </Section>

      {/* ========== 5. MOBILE EXPERIENCE ========== */}
      <Section className="py-20 sm:py-28 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">Your Staff Will Actually Want to Use This</h2>
              <p className="text-zinc-400 mb-8 leading-relaxed">
                No more &quot;I didn&apos;t see the schedule.&quot; ShiftSchedule is built mobile-first because that&apos;s where your team lives. Clean, fast, and dead simple.
              </p>
              <div className="space-y-4">
                {[
                  'View their schedule instantly — no hunting through menus',
                  'Pick up open shifts from your restaurant or the marketplace',
                  'Swap shifts with coworkers in two taps',
                  'Get push notifications the moment anything changes',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-zinc-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-center">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </Section>

      {/* ========== 6. COMPARISON ========== */}
      <Section className="py-20 sm:py-28 border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">How We Stack Up</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">The tools you&apos;re comparing us to. Here&apos;s the honest breakdown.</p>
          </div>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="text-left py-4 pr-4 text-zinc-500 font-medium" />
                  <th className="py-4 px-4 text-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                      <CalendarDays className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="font-bold text-emerald-400">ShiftSchedule</span>
                    </div>
                  </th>
                  <th className="py-4 px-4 text-center text-zinc-400 font-medium">HotSchedules</th>
                  <th className="py-4 px-4 text-center text-zinc-400 font-medium">7shifts</th>
                  <th className="py-4 px-4 text-center text-zinc-400 font-medium">When I Work</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { feature: 'Monthly Price', us: 'Free / $49', them: ['$180+', '$150+', '$100+'] },
                  { feature: 'Shift Marketplace', us: true, them: [false, false, false] },
                  { feature: 'Mobile Experience', us: 'Excellent', them: ['Dated', 'Good', 'Fair'] },
                  { feature: 'Setup Time', us: '5 min', them: ['2-3 weeks', '1 week', '3-5 days'] },
                  { feature: 'Free Tier', us: true, them: [false, false, 'Limited'] },
                  { feature: 'Multi-location', us: true, them: [true, true, true] },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-zinc-800/50">
                    <td className="py-4 pr-4 font-medium text-zinc-300">{row.feature}</td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.us === 'boolean' ? (
                        <Check className="w-5 h-5 text-emerald-400 mx-auto" />
                      ) : (
                        <span className="text-emerald-400 font-semibold">{row.us}</span>
                      )}
                    </td>
                    {row.them.map((val, j) => (
                      <td key={j} className="py-4 px-4 text-center text-zinc-500">
                        {typeof val === 'boolean' ? (
                          val ? <Check className="w-4 h-4 text-zinc-500 mx-auto" /> : <Minus className="w-4 h-4 text-zinc-700 mx-auto" />
                        ) : (
                          <span>{val}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ========== 7. PRICING ========== */}
      <Section id="pricing" className="py-20 sm:py-28 bg-zinc-900/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Simple, Honest Pricing</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">No per-employee fees. No annual contracts. No surprises.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 sm:p-8">
              <h3 className="font-bold text-lg mb-1">Free</h3>
              <p className="text-sm text-zinc-500 mb-5">For single-location restaurants getting started</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$0</span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              <ul className="space-y-3 mb-8">
                {[
                  '1 restaurant location',
                  'Up to 15 employees',
                  'Drag-and-drop scheduling',
                  'Shift swaps within your team',
                  'Mobile app for all staff',
                  'Time-off requests',
                ].map((f, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-sm text-zinc-400">
                    <Check className="w-4 h-4 text-zinc-600 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('waitlist')}
                className="w-full py-3 border border-zinc-700 text-zinc-300 rounded-xl font-semibold text-sm hover:bg-zinc-800 transition-colors"
              >
                Get Started Free
              </button>
            </div>

            {/* Pro */}
            <div className="relative bg-zinc-900 border-2 border-emerald-500/50 rounded-2xl p-6 sm:p-8 shadow-lg shadow-emerald-500/5">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-full">Most Popular</span>
              </div>
              <h3 className="font-bold text-lg mb-1">Pro</h3>
              <p className="text-sm text-zinc-500 mb-5">For restaurants that can&apos;t afford call-off chaos</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-extrabold">$49</span>
                <span className="text-zinc-500 text-sm">/month</span>
              </div>
              <p className="text-xs text-emerald-400 mb-6">Save $100+/mo vs HotSchedules</p>
              <ul className="space-y-3 mb-8">
                {[
                  'Everything in Free, plus:',
                  'Unlimited employees',
                  'Shift marketplace access',
                  'Multi-location support',
                  'Schedule analytics & labor costs',
                  'Priority support',
                ].map((f, i) => (
                  <li key={i} className={`flex items-center gap-2.5 text-sm ${i === 0 ? 'text-zinc-300 font-medium' : 'text-zinc-400'}`}>
                    <Check className={`w-4 h-4 shrink-0 ${i === 0 ? 'text-emerald-400' : 'text-emerald-500/70'}`} /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => scrollTo('waitlist')}
                className="w-full py-3 bg-emerald-500 text-white rounded-xl font-semibold text-sm hover:bg-emerald-400 transition-colors"
              >
                Get Early Access
              </button>
            </div>
          </div>
        </div>
      </Section>

      {/* ========== 8. TESTIMONIALS ========== */}
      <Section className="py-20 sm:py-28 border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">What Managers Are Saying</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                quote: 'We were paying HotSchedules $180 a month and half my staff didn\'t even check it. ShiftSchedule is free, and they actually use it. That alone sold me.',
                name: 'Maria S.',
                role: 'GM, Blackrock Franchise',
              },
              {
                quote: 'The marketplace is a game-changer. Last Saturday we had two call-offs and both shifts were filled in under 20 minutes. That used to take me all morning.',
                name: 'James D.',
                role: 'Owner, The Olive Branch',
              },
              {
                quote: 'My servers love the mobile app. They check their schedule, pick up extra shifts, and handle their own swaps. I barely touch it anymore.',
                name: 'Priya K.',
                role: 'Manager, Sushi on Fifth',
              },
            ].map((testimonial, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6"
              >
                {/* Stars */}
                <div className="flex gap-0.5 mb-4">
                  {[1, 2, 3, 4, 5].map((s) => <Star key={s} className="w-4 h-4 text-amber-400 fill-amber-400" />)}
                </div>
                <p className="text-sm text-zinc-300 leading-relaxed mb-5">&ldquo;{testimonial.quote}&rdquo;</p>
                <div>
                  <p className="text-sm font-semibold">{testimonial.name}</p>
                  <p className="text-xs text-zinc-500">{testimonial.role}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </Section>

      {/* ========== 9. WAITLIST CTA ========== */}
      <Section id="waitlist" className="py-20 sm:py-28 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-zinc-950 to-sky-500/5 pointer-events-none" />

        <div className="relative max-w-2xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Join the Switch from Overpriced Scheduling</h2>
          <p className="text-zinc-400 mb-10 max-w-lg mx-auto">Get early access to ShiftSchedule and be the first to try the shift marketplace. No credit card, no commitment.</p>

          {!submitted ? (
            <form onSubmit={handleWaitlistSubmit} className="space-y-4 max-w-md mx-auto text-left">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Work Email *</label>
                <input
                  type="email"
                  required
                  placeholder="you@restaurant.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Restaurant Name</label>
                <input
                  type="text"
                  placeholder="The Olive Branch"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1.5">Number of Employees</label>
                <input
                  type="number"
                  placeholder="25"
                  value={employeeCount}
                  onChange={(e) => setEmployeeCount(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? 'Joining...' : 'Get Early Access'}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-8"
            >
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
              <h3 className="text-xl font-bold mb-2">You&apos;re on the list!</h3>
              <p className="text-sm text-zinc-400">We&apos;ll send you early access as soon as it&apos;s ready. Thanks for choosing a better way to schedule.</p>
            </motion.div>
          )}
        </div>
      </Section>

      {/* ========== 10. FOOTER ========== */}
      <footer className="border-t border-zinc-900 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 mb-10">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center">
                  <CalendarDays className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="font-bold text-sm">ShiftSchedule</span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">Built for restaurants, by people who&apos;ve worked in them.</p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Product</h4>
              <ul className="space-y-2">
                {['Features', 'Pricing', 'Marketplace', 'Mobile App'].map((link) => (
                  <li key={link}><button onClick={() => scrollTo(link.toLowerCase().replace(' ', '-'))} className="text-sm text-zinc-500 hover:text-white transition-colors">{link}</button></li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Company</h4>
              <ul className="space-y-2">
                {['About', 'Contact', 'Careers'].map((link) => (
                  <li key={link}><span className="text-sm text-zinc-500">{link}</span></li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Legal</h4>
              <ul className="space-y-2">
                {['Privacy Policy', 'Terms of Service'].map((link) => (
                  <li key={link}><span className="text-sm text-zinc-500">{link}</span></li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-600">&copy; {new Date().getFullYear()} ShiftSchedule. All rights reserved.</p>
            <div className="flex items-center gap-4">
              {/* Social placeholders */}
              {['X', 'In', 'IG'].map((label) => (
                <span key={label} className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs text-zinc-500 font-medium hover:bg-zinc-700 transition-colors cursor-pointer">{label}</span>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
