import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion as Motion, useReducedMotion } from 'framer-motion';
import { SignInButton } from '@clerk/clerk-react';
import { Brain, ShieldCheck, Newspaper, Activity } from 'lucide-react';
import BackgroundParticles from './BackgroundParticles';
import GlitchTitle from './GlitchTitle';

const FEATURES = [
  {
    icon: Brain,
    title: 'Signal Intelligence',
    description: 'Real-time AI signals for credibility, framing, and context depth.',
  },
  {
    icon: ShieldCheck,
    title: 'Risk Detection',
    description: 'Highlights manipulation patterns and verification blind spots.',
  },
  {
    icon: Newspaper,
    title: 'Newsroom Workflow',
    description: 'Analyze stories faster with structured quality diagnostics.',
  },
];

const LIVE_SIGNALS = [
  { text: 'Source credibility: +12', tone: 'positive' },
  { text: 'Sensationalism detected', tone: 'warning' },
  { text: 'Context recovered', tone: 'positive' },
  { text: 'Claim needs verification', tone: 'critical' },
  { text: 'Cross-source alignment: 84%', tone: 'positive' },
  { text: 'Headline framing drift', tone: 'warning' },
  { text: 'Citation depth improved', tone: 'positive' },
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

function SignedOutLanding() {
  const reduceMotion = useReducedMotion();

  const trackRef = useRef(null);
  const roRef = useRef(null);
  const rafRef = useRef(null);

  const [trackHeight, setTrackHeight] = useState(0);

  // Always duplicate for seamless loop
  const tickerItems = useMemo(() => [...LIVE_SIGNALS, ...LIVE_SIGNALS], []);

  useEffect(() => {
    const measure = () => {
      if (!trackRef.current) return;
      const total = trackRef.current.scrollHeight;
      // Round to avoid subpixel seams
      const half = Math.round(total / 2);
      if (half > 0) setTrackHeight(half);
    };

    const scheduleMeasure = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    };

    scheduleMeasure();

    // Prefer ResizeObserver
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

  // Keep perceived speed constant regardless of number of items
  const pxPerSecond = 22; // tweak: 18 slower, 26 faster
  const tickerDuration = trackHeight > 0 ? trackHeight / pxPerSecond : 18;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#071A31] text-gray-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(210,210,9,0.11),transparent_38%),radial-gradient(circle_at_82%_18%,rgba(75,169,255,0.11),transparent_45%),linear-gradient(160deg,#071A31_0%,#0b2340_48%,#06192d_100%)]" />

      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <Motion.div
        aria-hidden="true"
        className="absolute -top-24 -left-16 h-72 w-72 rounded-full bg-lime-300/12 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 18, -10, 0], y: [0, 16, -8, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Motion.div
        aria-hidden="true"
        className="absolute top-[35%] right-[-80px] h-96 w-96 rounded-full bg-cyan-300/10 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, -22, 14, 0], y: [0, -12, 18, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
      />
      <Motion.div
        aria-hidden="true"
        className="absolute bottom-[-130px] left-[30%] h-80 w-80 rounded-full bg-lime-200/10 blur-3xl"
        animate={reduceMotion ? undefined : { x: [0, 10, -14, 0], y: [0, -16, 6, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
      />

      <Motion.div
        aria-hidden="true"
        className="absolute inset-x-0 h-32 pointer-events-none"
        style={{
          background:
            'linear-gradient(to bottom, rgba(210,210,9,0), rgba(210,210,9,0.06), rgba(210,210,9,0))',
        }}
        animate={reduceMotion ? undefined : { y: ['-18%', '118%'] }}
        transition={{ duration: 11, repeat: Infinity, ease: 'linear' }}
      />

      {!reduceMotion && (
        <div className="absolute inset-0 pointer-events-none opacity-70">
          <BackgroundParticles />
        </div>
      )}

      <div className="relative z-10 min-h-screen flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-6xl grid gap-8 lg:grid-cols-[1.3fr_0.7fr] items-center">
          <Motion.section
            className="rounded-3xl border border-white/12 bg-[#0a1f38]/72 backdrop-blur-xl shadow-[0_30px_70px_rgba(0,0,0,0.35)] p-7 sm:p-10"
            initial={reduceMotion ? undefined : { opacity: 0, y: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="inline-flex items-center px-3 py-1 rounded-full border border-lime-300/35 bg-lime-300/10 text-lime-200 text-xs font-semibold tracking-wide">
                AI NEWSROOM ACCESS
              </div>

              {/* LIVE chip */}
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/12 bg-white/5 text-xs font-semibold text-gray-200">
                <span
                  aria-hidden="true"
                  className={`h-2 w-2 rounded-full bg-emerald-300 ${reduceMotion ? '' : 'animate-pulse'}`}
                />
                LIVE · connected
              </div>
            </div>

            {reduceMotion ? (
              <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                Welcome to Newscore
              </h1>
            ) : (
              <GlitchTitle
                text="Welcome to Newscore"
                className="text-3xl sm:text-5xl font-extrabold tracking-tight"
                intensity="subtle"
              />
            )}

            <p className="mt-4 text-sm sm:text-base text-gray-200 max-w-2xl leading-relaxed">
              Your AI newsroom for credibility, context, and bias signals.
            </p>

            <div className="mt-8 grid gap-4">
              {FEATURES.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="flex items-start gap-3 rounded-xl border border-white/12 bg-[#0f2a49]/52 px-4 py-3"
                >
                  <div className="flex-shrink-0 rounded-lg p-2 bg-lime-300/12 border border-lime-300/30 text-lime-200">
                    {React.createElement(Icon, { className: 'w-4 h-4' })}
                  </div>
                  <div>
                    <p className="font-semibold text-white text-sm">{title}</p>
                    <p className="text-xs sm:text-sm text-gray-300">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <SignInButton mode="modal">
                <Motion.button
                  type="button"
                  className="relative inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold text-[#001a33] bg-gradient-to-r from-[#e3e30a] to-[#c4c408] shadow-[0_10px_25px_rgba(210,210,9,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-lime-300 focus-visible:ring-offset-[#0a1f38]"
                  whileHover={reduceMotion ? undefined : { y: -2, scale: 1.01 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.99 }}
                >
                  <Motion.span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-xl bg-lime-200/35 blur-lg"
                    animate={reduceMotion ? undefined : { opacity: [0.35, 0.68, 0.35] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <span className="relative z-10">Continue with Google</span>
                </Motion.button>
              </SignInButton>
            </div>
          </Motion.section>

          <Motion.aside
            className="hidden lg:flex flex-col rounded-2xl border border-white/10 bg-[#091b31]/75 backdrop-blur-lg p-5 min-h-[420px]"
            initial={reduceMotion ? undefined : { opacity: 0, x: 18 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            aria-label="Live signals"
          >
            <div className="flex items-center gap-2 text-lime-200 text-sm font-semibold mb-4">
              <Activity className="w-4 h-4" />
              Live signals
            </div>

            <div className="relative flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#07162a]/60 p-3">
              <div className="absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-[#07162a] to-transparent pointer-events-none z-10" />
              <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#07162a] to-transparent pointer-events-none z-10" />

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
                      'relative rounded-lg border px-3 py-2 text-xs font-medium',
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

      <footer className="absolute bottom-4 inset-x-0 z-10 text-center text-[11px] text-gray-300/85 px-4">
        Mirada21 Media Lab · Powered by Newscore
      </footer>
    </div>
  );
}

export default SignedOutLanding;
