import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { SignInButton } from '@clerk/clerk-react';
import {
  Brain,
  ShieldCheck,
  Newspaper,
  Activity,
  Sun,
  Moon,
  FileText,
  CheckCircle2,
  Clock3,
  Circle,
} from 'lucide-react';
import BackgroundParticles from './BackgroundParticles';
import GlitchTitle from './GlitchTitle';

const FEATURES = [
  {
    icon: Brain,
    title: 'Explainable Signal Model',
    description: 'Each score is backed by visible checks for source quality, claim support, and framing intensity.',
  },
  {
    icon: ShieldCheck,
    title: 'Verification Workflow',
    description: 'Flag verification gaps early and keep a structured trail before publication.',
  },
  {
    icon: Newspaper,
    title: 'Editorial Quality Lens',
    description: 'Assess credibility, bias, and context depth in one newsroom-ready pass.',
  },
];

const TRUST_CONTEXT = [
  'Designed for journalists, researchers, and media labs',
  'Structured verification over black-box scoring',
  'Signal-by-signal reasoning your team can audit',
];

const PREVIEW_KPIS = [
  {
    label: 'Credibility',
    value: '81/100',
    note: '3 primary sources matched',
    tone: 'positive',
  },
  {
    label: 'Bias Risk',
    value: 'Moderate',
    note: 'Framing pressure in headline',
    tone: 'warning',
  },
  {
    label: 'Verification Gaps',
    value: '2 open',
    note: 'One unattributed statistic',
    tone: 'critical',
  },
  {
    label: 'Context Depth',
    value: 'Strong',
    note: 'Timeline + counterpoint present',
    tone: 'positive',
  },
];

const ANALYSIS_STEPS = [
  { label: 'Article parsed', status: 'complete' },
  { label: 'Claims extracted', status: 'complete' },
  { label: 'Cross-source verification', status: 'active' },
  { label: 'Editorial summary generated', status: 'pending' },
];

const LIVE_SIGNALS = [
  { text: 'Primary source identified in paragraph 4', tone: 'positive' },
  { text: 'Headline framing drift from body claim', tone: 'warning' },
  { text: 'Statistical claim lacks attribution', tone: 'critical' },
  { text: 'Quoted expert affiliation verified', tone: 'positive' },
  { text: 'Context window expanded with timeline', tone: 'positive' },
  { text: 'Potential causal leap in final section', tone: 'critical' },
  { text: 'Counterpoint source missing', tone: 'warning' },
  { text: 'Evidence-to-claim ratio improved', tone: 'positive' },
  { text: 'Anonymous source dependency detected', tone: 'warning' },
  { text: 'Public record reference matched', tone: 'positive' },
  { text: 'Loaded adjective detected in lead', tone: 'warning' },
  { text: 'Core figure contradicted by source doc', tone: 'critical' },
  { text: 'Chronology clarified across sections', tone: 'positive' },
  { text: 'Methodology context not provided', tone: 'warning' },
  { text: 'Verification confidence rising', tone: 'positive' },
  { text: 'Interpretation presented as fact', tone: 'critical' },
];

function signalToneClasses(tone) {
  if (tone === 'critical') return 'text-red-300 border-red-400/30 bg-red-500/10';
  if (tone === 'warning') return 'text-amber-200 border-amber-400/30 bg-amber-500/10';
  return 'text-emerald-200 border-emerald-400/30 bg-emerald-500/10';
}

function signalAccentStripe(tone) {
  if (tone === 'critical') return 'before:bg-red-300/70';
  if (tone === 'warning') return 'before:bg-amber-300/70';
  return 'before:bg-emerald-300/70';
}

function kpiToneClasses(tone) {
  if (tone === 'critical') return 'border-red-400/25 bg-red-500/10';
  if (tone === 'warning') return 'border-amber-400/25 bg-amber-500/10';
  return 'border-emerald-400/25 bg-emerald-500/10';
}

function stepStatusClasses(status) {
  if (status === 'complete') return 'text-emerald-300';
  if (status === 'active') return 'text-amber-300';
  return 'text-[color:var(--hw-text-muted)]';
}

function StepIcon({ status, reduceMotion }) {
  if (status === 'complete') {
    return <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />;
  }

  if (status === 'active') {
    return (
      <Clock3
        className={`h-4 w-4 text-amber-300 ${reduceMotion ? '' : 'animate-pulse'}`}
        aria-hidden="true"
      />
    );
  }

  return <Circle className="h-4 w-4 text-[color:var(--hw-text-muted)]" aria-hidden="true" />;
}

function SignedOutLanding({ isDarkMode, onToggleTheme }) {
  const reduceMotion = useReducedMotion();

  const trackRef = useRef(null);
  const roRef = useRef(null);
  const rafRef = useRef(null);

  const [trackHeight, setTrackHeight] = useState(0);

  const tickerItems = useMemo(() => [...LIVE_SIGNALS, ...LIVE_SIGNALS], []);

  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const total = trackRef.current.scrollHeight;
      const half = Math.round(total / 2);
      if (half > 0) setTrackHeight(half);
    };

    const scheduleMeasure = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    if (typeof ResizeObserver !== 'undefined' && trackRef.current) {
      roRef.current = new ResizeObserver(() => scheduleMeasure());
      roRef.current.observe(trackRef.current);
    } else {
      window.addEventListener('resize', scheduleMeasure);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (roRef.current) roRef.current.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, []);

  const shouldAnimateTicker = !reduceMotion && trackHeight > 0;
  const pxPerSecond = 20;
  const tickerDuration = trackHeight > 0 ? trackHeight / pxPerSecond : 18;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[color:var(--hw-bg)] text-[color:var(--hw-text)] transition-colors duration-300">
      <div className={`absolute inset-0 ${
        isDarkMode
          ? 'bg-[radial-gradient(circle_at_20%_10%,rgba(212,230,0,0.11),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(0,243,255,0.08),transparent_45%),linear-gradient(160deg,#050505_0%,#0b0b0b_48%,#111111_100%)]'
          : 'bg-[radial-gradient(circle_at_20%_10%,rgba(212,230,0,0.15),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(0,243,255,0.06),transparent_45%),linear-gradient(160deg,#f9fafb_0%,#f1f5f9_48%,#ffffff_100%)]'
      }`} />

      <div className="absolute right-6 top-6 z-30">
        <button
          type="button"
          onClick={onToggleTheme}
          className="h-11 w-11 rounded-full border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)] text-[color:var(--hw-text)] flex items-center justify-center hover:text-lima hover:border-lima transition-colors"
          title={isDarkMode ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
          aria-label={isDarkMode ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
        >
          {isDarkMode ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
      </div>

      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <Motion.div
        aria-hidden="true"
        className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-lime-300/10 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 14, -8, 0], y: [0, 12, -6, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Motion.div
        aria-hidden="true"
        className="absolute top-[35%] right-[-80px] h-96 w-96 rounded-full bg-cyan-300/9 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -18, 12, 0], y: [0, -10, 15, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Motion.div
        aria-hidden="true"
        className="absolute bottom-[-130px] left-[30%] h-80 w-80 rounded-full bg-lime-200/8 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 8, -10, 0], y: [0, -14, 5, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />

      <Motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 h-28"
        style={{
          background:
            'linear-gradient(to bottom, rgba(210,210,9,0), rgba(210,210,9,0.045), rgba(210,210,9,0))',
        }}
        animate={reduceMotion ? undefined : { y: ['-20%', '120%'] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'linear' }}
      />

      {!reduceMotion && (
        <div className="pointer-events-none absolute inset-0 opacity-55">
          <BackgroundParticles />
        </div>
      )}

      <div className="relative z-10 flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <div className="grid w-full max-w-6xl items-center gap-8 lg:grid-cols-[1.3fr_0.7fr]">
          <Motion.section
            className={`rounded-3xl border backdrop-blur-xl p-7 sm:p-10 ${
              isDarkMode
                ? 'border-white/12 bg-[#141414]/72 shadow-[0_30px_70px_rgba(0,0,0,0.35)]'
                : 'border-black/10 bg-white/85 shadow-[0_20px_55px_rgba(15,23,42,0.14)]'
            }`}
            initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center rounded-full border border-lima/40 bg-lima/15 px-3 py-1 text-xs font-semibold tracking-wide text-lima">
                EDITORIAL INTELLIGENCE PLATFORM
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/55 px-3 py-1 text-xs font-semibold text-[color:var(--hw-text-muted)]">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full bg-emerald-300 ${reduceMotion ? '' : 'animate-pulse'}`}
                />
                Explainable signals · live
              </div>
            </div>

            {reduceMotion ? (
              <h1 className="text-3xl font-extrabold tracking-tight text-[color:var(--hw-text)] sm:text-5xl">
                Analyze the quality of a story before it shapes public opinion.
              </h1>
            ) : (
              <GlitchTitle
                text="Analyze the quality of a story before it shapes public opinion."
                className="text-3xl font-extrabold tracking-tight sm:text-5xl"
                intensity="subtle"
              />
            )}

            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[color:var(--hw-text-muted)] sm:text-base">
              Newscore evaluates each article across credibility, bias, framing, context depth, evidence quality,
              and verification gaps so newsroom teams can decide faster with clearer reasoning.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/60 px-4 py-4"
                >
                  <div className="mb-2 inline-flex rounded-lg border border-lima/40 bg-lima/15 p-2 text-lima">
                    {React.createElement(Icon, { className: 'h-4 w-4' })}
                  </div>
                  <p className="text-sm font-semibold text-[color:var(--hw-text)]">{title}</p>
                  <p className="mt-1 text-xs text-[color:var(--hw-text-muted)] sm:text-sm">{description}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg-elevated)]/60 p-4 sm:p-5">
              <p className="text-sm font-semibold text-[color:var(--hw-text)]">Open your Newscore workspace</p>
              <p className="mt-1 text-xs text-[color:var(--hw-text-muted)] sm:text-sm">
                Run your first article analysis and get an explainable signal report in under a minute.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <SignInButton mode="modal">
                  <Motion.button
                    type="button"
                    className={`relative inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold text-[#050505] bg-gradient-to-r from-[#d4e600] to-[#c6dd00] shadow-[0_10px_25px_rgba(212,230,0,0.26)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-lime-300 ${
                      isDarkMode ? 'focus-visible:ring-offset-[#0f0f0f]' : 'focus-visible:ring-offset-white'
                    }`}
                    whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                  >
                    <Motion.span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-xl bg-lima/30 blur-lg"
                      animate={reduceMotion ? undefined : { opacity: [0.32, 0.6, 0.32] }}
                      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                    />
                    <span className="relative z-10">Sign in and analyze your first article</span>
                  </Motion.button>
                </SignInButton>

                <p className="text-xs text-[color:var(--hw-text-muted)]">
                  Google sign-in · no setup required · session starts instantly
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-2 sm:grid-cols-3">
              {TRUST_CONTEXT.map((item) => (
                <div
                  key={item}
                  className="rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg)]/40 px-3 py-2 text-xs text-[color:var(--hw-text-muted)]"
                >
                  {item}
                </div>
              ))}
            </div>
          </Motion.section>

          <Motion.aside
            className={`hidden min-h-[540px] flex-col rounded-2xl border backdrop-blur-lg p-5 lg:flex ${
              isDarkMode ? 'border-white/10 bg-[#131313]/78' : 'border-black/10 bg-white/82'
            }`}
            initial={reduceMotion ? undefined : { opacity: 0, x: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            aria-label="Analysis preview"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-lima">
                  <Activity className="h-4 w-4" />
                  Analysis preview
                </p>
                <p className="mt-1 text-xs text-[color:var(--hw-text-muted)]">
                  Sample output from Newscore signal engine
                </p>
              </div>
              <span className="rounded-md border border-[color:var(--hw-border)] bg-[color:var(--hw-bg)]/50 px-2 py-1 text-[10px] font-medium text-[color:var(--hw-text-muted)]">
                demo article
              </span>
            </div>

            <div className="rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg)]/45 p-3">
              <p className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--hw-text-muted)]">Article</p>
              <p className="mt-1 text-sm font-semibold leading-snug text-[color:var(--hw-text)]">
                City climate policy cuts emissions, but equity impacts remain disputed
              </p>
              <p className="mt-1 flex items-center gap-1 text-[11px] text-[color:var(--hw-text-muted)]">
                <FileText className="h-3 w-3" />
                Metro Desk Weekly · 1,284 words · analyzed in 14.2s
              </p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {PREVIEW_KPIS.map((kpi) => (
                <div
                  key={kpi.label}
                  className={`rounded-lg border p-2.5 ${kpiToneClasses(kpi.tone)}`}
                >
                  <p className="text-[10px] uppercase tracking-wide text-[color:var(--hw-text-muted)]">{kpi.label}</p>
                  <p className="mt-1 text-sm font-semibold text-[color:var(--hw-text)]">{kpi.value}</p>
                  <p className="mt-1 text-[11px] text-[color:var(--hw-text-muted)]">{kpi.note}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg)]/45 p-3">
              <p className="text-xs font-semibold text-[color:var(--hw-text)]">Editorial summary</p>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--hw-text-muted)]">
                Coverage is well sourced but overstates causality in the lead. Add attribution for the economic
                impact figure and include one dissenting expert to improve balance.
              </p>
            </div>

            <div className="mt-4 rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg)]/45 p-3">
              <p className="mb-2 text-xs font-semibold text-[color:var(--hw-text)]">Pipeline status</p>
              <ul className="space-y-1.5 text-xs">
                {ANALYSIS_STEPS.map((step) => (
                  <li key={step.label} className="flex items-center gap-2">
                    <StepIcon status={step.status} reduceMotion={reduceMotion} />
                    <span className={stepStatusClasses(step.status)}>{step.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-4 flex-1 overflow-hidden rounded-xl border border-[color:var(--hw-border)] bg-[color:var(--hw-bg)]/40 p-3">
              <p className="mb-2 text-xs font-semibold text-[color:var(--hw-text)]">Live checks</p>
              <div className="pointer-events-none absolute inset-x-0 top-7 z-10 h-8 bg-gradient-to-b from-[color:var(--hw-bg)] to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-[color:var(--hw-bg)] to-transparent" />

              <Motion.div
                ref={trackRef}
                className="space-y-2 will-change-transform"
                animate={shouldAnimateTicker ? { y: [0, -trackHeight] } : undefined}
                transition={
                  shouldAnimateTicker
                    ? { duration: tickerDuration, ease: 'linear', repeat: Infinity }
                    : undefined
                }
              >
                {(reduceMotion ? LIVE_SIGNALS : tickerItems).map((item, idx) => (
                  <div
                    key={`${item.text}-${idx}`}
                    className={[
                      'relative rounded-lg border px-3 py-2 text-[11px] font-medium leading-relaxed',
                      'before:absolute before:left-0 before:top-0 before:h-full before:w-[3px] before:rounded-l-lg',
                      signalAccentStripe(item.tone),
                      signalToneClasses(item.tone),
                    ].join(' ')}
                  >
                    {item.text}
                  </div>
                ))}
              </Motion.div>
            </div>
          </Motion.aside>
        </div>
      </div>

      <footer className="absolute inset-x-0 bottom-4 z-10 px-4 text-center text-[11px] text-[color:var(--hw-text-muted)]">
        Newscore by Mirada21 Media Lab · Built for rigorous news verification workflows
      </footer>
    </div>
  );
}

export default SignedOutLanding;
