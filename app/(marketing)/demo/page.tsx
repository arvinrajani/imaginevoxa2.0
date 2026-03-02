'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Play,
  Pause,
  Sparkles,
  UserPlus,
  Wand2,
  Send,
  Shield,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedLogo } from '@/components/brand/animated-logo';

const DEMO_STEPS = [
  {
    id: 'signup',
    title: 'Sign up in seconds',
    description: 'Create your Voxa workspace and connect LinkedIn in one guided flow.',
    icon: UserPlus,
    cta: 'Create account',
  },
  {
    id: 'prompt',
    title: 'Prompt the AI',
    description: 'Describe your topic, tone, and goal. Voxa drafts with built-in quality checks.',
    icon: Wand2,
    cta: 'Generate post',
  },
  {
    id: 'publish',
    title: 'Publish & track',
    description: 'Review the preview, publish instantly, and watch analytics sync automatically.',
    icon: Send,
    cta: 'Publish to LinkedIn',
  },
];

export default function DemoPage() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % DEMO_STEPS.length);
    }, 4200);
    return () => clearInterval(timer);
  }, [isPlaying]);

  const current = useMemo(() => DEMO_STEPS[activeStep], [activeStep]);

  return (
    <div className="min-h-screen bg-transparent text-gray-800">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/75 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <AnimatedLogo size="lg" />
            </Link>
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-gray-200/60 bg-gray-50 px-2 py-1 text-sm font-medium text-gray-600">
              <Link href="/#features" className="px-3 py-1 rounded-full hover:bg-gray-100 hover:text-gray-900 transition-colors">Features</Link>
              <Link href="/pricing" className="px-3 py-1 rounded-full hover:bg-gray-100 hover:text-gray-900 transition-colors">Pricing</Link>
              <Link href="/demo" className="px-3 py-1 rounded-full bg-gray-100 text-gray-900 transition-colors">Demo</Link>
              <Link href="/#testimonials" className="px-3 py-1 rounded-full hover:bg-gray-100 hover:text-gray-900 transition-colors">Testimonials</Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/app">
                <Button variant="ghost" className="text-gray-600 hover:text-gray-900">
                  Sign In
                </Button>
              </Link>
              <Link href="/signup">
                <Button className="bg-voxa-gradient hover:opacity-90 text-white px-6">
                  Get Started
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <section className="pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_1.1fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-gray-100 text-cyan-600 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-gray-200/60">
                <Play className="h-4 w-4" />
                Product demo
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-5">
                Watch the Voxa workflow in motion
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                This guided demo shows the exact flow your customers experience: sign up, prompt the AI, publish, and track.
              </p>

              <div className="space-y-4">
                {DEMO_STEPS.map((step, index) => (
                  <button
                    key={step.id}
                    onClick={() => setActiveStep(index)}
                    className={`w-full text-left p-4 rounded-2xl border transition ${
                      activeStep === index
                        ? 'border-cyan-300/70 bg-white/10'
                        : 'border-gray-200/60 bg-white/60 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                        activeStep === index ? 'bg-voxa-gradient text-white' : 'bg-gray-100 text-cyan-600'
                      }`}>
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{step.title}</p>
                        <p className="text-sm text-gray-500">{step.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-3">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-100"
                  onClick={() => setIsPlaying((prev) => !prev)}
                >
                  {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
                  {isPlaying ? 'Pause demo' : 'Play demo'}
                </Button>
                <Link href="/signup">
                  <Button className="bg-voxa-gradient hover:opacity-90 text-gray-900">
                    Start building <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-3 bg-voxa-gradient rounded-[2.5rem] blur-2xl opacity-20" />
              <div className="relative rounded-3xl border border-gray-200/60 bg-white/80 shadow-voxa overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/60 bg-white/5">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-rose-400" />
                    <div className="h-3 w-3 rounded-full bg-amber-300" />
                    <div className="h-3 w-3 rounded-full bg-emerald-400" />
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-cyan-600" />
                    Voxa demo player
                  </div>
                </div>

                <div className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-500">Now playing</p>
                      <h2 className="text-xl font-semibold text-gray-900">{current.title}</h2>
                    </div>
                    <span className="text-xs text-cyan-600 bg-gray-100 px-3 py-1 rounded-full">
                      Step {activeStep + 1} of {DEMO_STEPS.length}
                    </span>
                  </div>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={current.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className="rounded-2xl border border-gray-200/60 bg-gray-50 p-5"
                    >
                      {current.id === 'signup' && (
                        <div className="space-y-4">
                          <div className="grid gap-3">
                            <div className="h-10 rounded-xl bg-gray-100 border border-gray-200/60 flex items-center px-3 text-sm text-gray-600">
                              Name
                            </div>
                            <div className="h-10 rounded-xl bg-gray-100 border border-gray-200/60 flex items-center px-3 text-sm text-gray-600">
                              Email address
                            </div>
                            <div className="h-10 rounded-xl bg-gray-100 border border-gray-200/60 flex items-center px-3 text-sm text-gray-600">
                              Password
                            </div>
                          </div>
                          <Button className="w-full bg-voxa-gradient text-white hover:opacity-90">
                            {current.cta}
                          </Button>
                        </div>
                      )}

                      {current.id === 'prompt' && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-gray-200/60 bg-gray-100 p-4 text-sm text-gray-700">
                            “Write a LinkedIn post about building a sales pipeline. Tone: confident, data-driven.”
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            {['Professional', 'Bold', 'Inspirational'].map((tone) => (
                              <span key={tone} className="text-xs text-gray-600 bg-gray-100 border border-gray-200/60 px-2 py-2 rounded-lg text-center">
                                {tone}
                              </span>
                            ))}
                          </div>
                          <Button className="w-full bg-voxa-gradient text-white hover:opacity-90">
                            {current.cta}
                          </Button>
                        </div>
                      )}

                      {current.id === 'publish' && (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-gray-200/60 bg-gray-100 p-4">
                            <p className="text-sm text-gray-700 mb-3">
                              “The fastest teams I’ve worked with share one habit: they review pipeline weekly and remove stalled deals.”
                            </p>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              <span>❤ 312</span>
                              <span>💬 48</span>
                              <span>↗ 27</span>
                            </div>
                          </div>
                          <Button className="w-full bg-[#0A66C2] hover:bg-[#004182] text-gray-900">
                            {current.cta}
                          </Button>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  <div className="mt-6">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span>Playback</span>
                      <span>{isPlaying ? 'Auto' : 'Paused'}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full bg-voxa-gradient transition-all"
                        style={{ width: `${((activeStep + 1) / DEMO_STEPS.length) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-16 rounded-2xl border border-gray-200/60 bg-white/70 p-6">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="h-5 w-5 text-cyan-600" />
              <p className="font-semibold text-gray-900">What this demo covers</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 text-sm text-gray-600">
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-emerald-400 mt-0.5" />
                Account creation + onboarding checklist
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-emerald-400 mt-0.5" />
                Prompting workflow + tone selection
              </div>
              <div className="flex items-start gap-2">
                <Check className="h-4 w-4 text-emerald-400 mt-0.5" />
                Post preview, publish, and metrics sync
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
