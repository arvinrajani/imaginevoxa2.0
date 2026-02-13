'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Zap, 
  ArrowRight, 
  Check, 
  Star, 
  TrendingUp,
  Clock,
  Shield,
  Layers,
  Target,
  Lightbulb,
  Play,
  ChevronRight,
  Quote
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedLogo } from '@/components/brand/animated-logo';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

// Guest Generator Component
function GuestGenerator() {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<{content: string; imageUrl: string} | null>(null);

  // Different content templates based on tone
  const toneTemplates: Record<string, (topic: string) => { content: string; imageUrl: string }> = {
    professional: (topic) => ({
      content: `${topic} isn't a one-time project. The teams that win treat it like a system.\n\nAfter reviewing dozens of examples, three patterns show up again and again:\n- Clear ownership beats shared responsibility\n- Weekly cadence beats sporadic sprints\n- Simple scorecards beat vanity metrics\n\nIf you're working on ${topic}, try a 10-minute audit:\n1) What single outcome matters most?\n2) Which leading metric predicts it?\n3) What will you stop doing to make room?\n\nSmall systems create big results.\n\nWhat change moved the needle for you?\n\n#${topic.replace(/\s+/g, '')} #Leadership #Strategy`,
      imageUrl: 'https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=800&h=600&fit=crop'
    }),
    casual: (topic) => ({
      content: `Quick thought on ${topic}.\n\nI used to overthink it. What helped me most:\n- Pick one small win for this week\n- Show up consistently\n- Review what worked on Friday\n\nThat's it. The boring basics win.\n\nWhat are you trying right now?\n\n#${topic.replace(/\s+/g, '')} #RealTalk #Learning`,
      imageUrl: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&h=600&fit=crop'
    }),
    bold: (topic) => ({
      content: `Hot take on ${topic.toUpperCase()}:\n\nMost advice is optimized for feeling busy, not getting results.\n\nIf you want outcomes, do the opposite:\n- Say no to "nice-to-have" projects\n- Measure one metric that actually moves the needle\n- Ship before it's perfect, then iterate\n\nThe fastest teams I see win by reducing noise, not adding tools.\n\nAgree or disagree?\n\n#${topic.replace(/\s+/g, '')} #Mindset #Execution`,
      imageUrl: 'https://images.unsplash.com/photo-1533227268428-f9ed0900fb3b?w=800&h=600&fit=crop'
    }),
  };

  const handleGenerate = async () => {
    if (!topic.trim()) return;
    setIsGenerating(true);
    
    // Simulate generation for demo
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    const template = toneTemplates[tone] || toneTemplates.professional;
    setGeneratedPost(template(topic));
    setIsGenerating(false);
  };

  return (
    <div className="relative">
      {/* Glow effect */}
      <div className="absolute -inset-1 bg-voxa-gradient rounded-3xl blur-xl opacity-20 group-hover:opacity-30 transition-opacity" />
      
      <div className="relative bg-[#0b1234]/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="h-10 w-10 rounded-xl bg-voxa-gradient flex items-center justify-center">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="font-semibold text-white">AI Post Generator</h3>
              <p className="text-sm text-slate-400">Try it free - no signup required</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                What&apos;s your topic?
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., Remote work productivity tips"
                className="w-full px-4 py-3 rounded-xl border border-white/10 bg-[#0f173d] focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">
                Tone
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['professional', 'casual', 'bold'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTone(t)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      tone === t
                        ? 'bg-voxa-gradient text-white shadow-lg shadow-voxa'
                        : 'bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!topic.trim() || isGenerating}
              className="w-full h-12 bg-voxa-gradient hover:opacity-90 text-white font-semibold rounded-xl shadow-lg shadow-voxa transition-all duration-300"
            >
              {isGenerating ? (
                <motion.div
                  className="flex items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Crafting your post...</span>
                </motion.div>
              ) : (
                <span className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Generate Post
                </span>
              )}
            </Button>
          </div>
        </div>

        {/* Generated Result */}
        <AnimatePresence>
          {generatedPost && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-white/10"
            >
              <div className="p-6 sm:p-8 bg-[#0c1436]">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium text-cyan-200 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    Generated!
                  </span>
                  <span className="text-xs text-slate-400 bg-white/10 px-2 py-1 rounded-full">
                    Preview
                  </span>
                </div>
                
                {/* LinkedIn Post Preview */}
                <div className="bg-[#0b1234] rounded-xl border border-white/10 p-4 shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="h-12 w-12 rounded-full bg-voxa-gradient" />
                    <div>
                      <p className="font-semibold text-white">Your Name</p>
                      <p className="text-xs text-slate-400">Just now • 🌐</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-200 whitespace-pre-line mb-4">
                    {generatedPost.content}
                  </p>
                  <img
                    src={generatedPost.imageUrl}
                    alt="Generated"
                    className="w-full h-48 object-cover rounded-lg"
                  />
                </div>

                {/* CTA to publish */}
                <div className="mt-4 p-4 bg-white/5 rounded-xl border border-white/10">
                  <p className="text-sm text-slate-200 mb-3">
                    <strong>Ready to publish?</strong> Sign up to post directly to LinkedIn and unlock PDF, image, and video uploads.
                  </p>
                  <Link href="/signup">
                    <Button className="w-full bg-voxa-gradient hover:opacity-90 text-white font-semibold">
                      Sign Up to Publish <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Pricing Card Component
function PricingCard({ 
  name, 
  price, 
  period, 
  description, 
  features, 
  popular, 
  cta,
  credits 
}: {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  cta: string;
  credits: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6 }}
      className="relative"
    >
      <div
        className={`relative h-full rounded-2xl border ${
          popular ? 'border-cyan-400/40 bg-[#0b1234]/90' : 'border-white/10 bg-[#0b1234]/80'
        }`}
      >
        <div
          className={`absolute inset-x-8 top-0 h-px ${
            popular
              ? 'bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent'
              : 'bg-gradient-to-r from-transparent via-white/15 to-transparent'
          }`}
        />
        {popular && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="bg-white/10 text-cyan-100 text-xs font-semibold px-4 py-1.5 rounded-full border border-white/10">
              MOST POPULAR
            </span>
          </div>
        )}

        <div className="p-8 h-full flex flex-col">
          <div className="mb-6">
            <h3 className="text-xl font-semibold mb-2 text-white">{name}</h3>
            <p className="text-sm text-slate-300">{description}</p>
          </div>

          <div className="mb-6">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold text-white">{price}</span>
              <span className="text-slate-400">/{period}</span>
            </div>
            <p className="text-sm mt-1 text-slate-400">{credits}</p>
          </div>

          <ul className="space-y-3 mb-8 flex-1">
            {features.map((feature, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="h-5 w-5 rounded-full flex items-center justify-center bg-white/10">
                  <Check className="h-3 w-3 text-cyan-200" />
                </div>
                <span className="text-sm text-slate-200">{feature}</span>
              </li>
            ))}
          </ul>

          <Link href="/signup">
            <Button
              className={`w-full h-12 font-semibold rounded-xl transition-all ${
                popular
                  ? 'bg-white text-[#0B1028] hover:bg-slate-100'
                  : 'bg-white/10 text-white border border-white/15 hover:bg-white/15'
              }`}
            >
              {cta}
            </Button>
          </Link>
        </div>
      </div>
    </motion.div>
  );
}

// Testimonial Component
function Testimonial({ quote, author, role, avatar }: { quote: string; author: string; role: string; avatar: string }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className="bg-[#0b1234] rounded-2xl p-6 border border-white/10 shadow-lg"
    >
      <Quote className="h-8 w-8 text-cyan-400 mb-4" />
      <p className="text-slate-300 mb-4">{quote}</p>
      <div className="flex items-center gap-3">
        <img src={avatar} alt={author} className="h-10 w-10 rounded-full object-cover" />
        <div>
          <p className="font-semibold text-white">{author}</p>
          <p className="text-sm text-slate-400">{role}</p>
        </div>
      </div>
    </motion.div>
  );
}

// Stats Component
function StatCard({ value, label, icon: Icon }: { value: string; label: string; icon: React.ElementType }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-white/10 border border-white/10 mb-3">
        <Icon className="h-6 w-6 text-cyan-200" />
      </div>
      <p className="text-3xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm text-slate-400">{label}</p>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const oauthCode = searchParams.get('code');

  useEffect(() => {
    if (!oauthCode) return;

    const params = new URLSearchParams(queryString);
    if (!params.get('next')) {
      params.set('next', '/app');
    }

    if (typeof window !== 'undefined') {
      window.location.replace(`/auth/callback?${params.toString()}`);
    }
  }, [oauthCode, queryString, router]);

  useEffect(() => {
    if (oauthCode) return;

    let active = true;
    const supabase = createClient();

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data.session?.user) {
          router.replace('/app');
        }
      } catch {
        // Keep landing page usable if session lookup fails.
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        router.replace('/app');
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [oauthCode, router]);

  return (
    <div className="min-h-screen bg-transparent text-slate-100">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#0b1234]/70 backdrop-blur-xl border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <AnimatedLogo size="lg" />
            </Link>
            
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-sm font-medium text-slate-300">
              <a href="#features" className="px-3 py-1 rounded-full hover:bg-white/10 hover:text-white transition-colors">Features</a>
              <a href="#pricing" className="px-3 py-1 rounded-full hover:bg-white/10 hover:text-white transition-colors">Pricing</a>
              <Link href="/demo" className="px-3 py-1 rounded-full hover:bg-white/10 hover:text-white transition-colors">Demo</Link>
              <a href="#testimonials" className="px-3 py-1 rounded-full hover:bg-white/10 hover:text-white transition-colors">Testimonials</a>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/login">
                <Button variant="ghost" className="text-slate-300 hover:text-white">
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

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Copy */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 bg-white/10 text-cyan-200 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-white/10">
                <Sparkles className="h-4 w-4" />
                Imaginevoxa AI for LinkedIn
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
                Precision-built LinkedIn content that{' '}
                <span className="text-transparent bg-clip-text bg-voxa-gradient">
                  sounds like you
                </span>
                {' '}and scales with you
              </h1>
              
              <p className="text-xl text-slate-300 mb-8 leading-relaxed">
                Imaginevoxa blends AI generation with publishing workflow, quality checks, and analytics—so every post is on-brand, on-time, and built to perform.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <Link href="/signup">
                  <Button size="lg" className="h-14 px-8 bg-voxa-gradient hover:opacity-90 text-white font-semibold text-lg shadow-lg shadow-voxa">
                    Get Started <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 px-8 font-semibold text-lg border-white/20 text-white hover:bg-white/10"
                  asChild
                >
                  <Link href="/demo">
                    <Play className="h-5 w-5 mr-2" />
                    Watch Demo
                  </Link>
                </Button>
              </div>

              {/* Social Proof */}
              <div className="flex flex-wrap items-center gap-6">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div
                      key={i}
                      className="h-10 w-10 rounded-full border-2 border-white/15 bg-voxa-gradient"
                    />
                  ))}
                </div>
                <div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm text-slate-400">
                    <strong className="text-white">2,500+</strong> creators trust us
                  </p>
                </div>
                <div className="text-xs text-slate-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                  Avg time saved per week: <span className="text-white font-semibold">5.2 hours</span>
                </div>
              </div>
            </motion.div>

            {/* Right: Generator */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <GuestGenerator />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-[#070c28] border-y border-white/10">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard value="50K+" label="Posts Generated" icon={Zap} />
            <StatCard value="2.5M+" label="Engagement Gained" icon={TrendingUp} />
            <StatCard value="10x" label="Faster Creation" icon={Clock} />
            <StatCard value="99.9%" label="Uptime" icon={Shield} />
          </div>
          
          {/* Trust Badges */}
          <div className="mt-12 pt-8 border-t border-white/10">
            <p className="text-center text-sm text-slate-400 mb-6">Trusted by professionals from</p>
            <div className="flex flex-wrap items-center justify-center gap-8 opacity-60 grayscale">
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path d="M20.283 10.356h-8.327v3.451h4.792c-.446 2.193-2.313 3.453-4.792 3.453a5.27 5.27 0 0 1-5.279-5.28 5.27 5.27 0 0 1 5.279-5.279c1.259 0 2.397.447 3.29 1.178l2.6-2.599c-1.584-1.381-3.615-2.233-5.89-2.233a8.908 8.908 0 0 0-8.934 8.934 8.907 8.907 0 0 0 8.934 8.934c4.467 0 8.529-3.249 8.529-8.934 0-.528-.081-1.097-.202-1.625z"/></svg>
                <span className="font-semibold">Google</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.6.11.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/></svg>
                <span className="font-semibold">GitHub</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
                <span className="font-semibold">LinkedIn</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path d="M22.675 0h-21.35c-.732 0-1.325.593-1.325 1.325v21.351c0 .731.593 1.324 1.325 1.324h11.495v-9.294h-3.128v-3.622h3.128v-2.671c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.795.143v3.24l-1.918.001c-1.504 0-1.795.715-1.795 1.763v2.313h3.587l-.467 3.622h-3.12v9.293h6.116c.73 0 1.323-.593 1.323-1.325v-21.35c0-.732-.593-1.325-1.325-1.325z"/></svg>
                <span className="font-semibold">Meta</span>
              </div>
              <div className="flex items-center gap-2 text-slate-500">
                <svg className="h-8 w-8" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                <span className="font-semibold">YouTube</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Everything you need to dominate LinkedIn
              </h2>
              <p className="text-xl text-slate-300 max-w-2xl mx-auto">
                Professional content creation, scheduling, and analytics — all in one powerful platform.
              </p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[
              {
                icon: Sparkles,
                title: 'AI Content Generation',
                description: 'Generate engaging posts tailored to your voice and industry with advanced AI.',
                gradient: 'from-cyan-500 to-purple-600',
              },
              {
                icon: Zap,
                title: 'One-Click Publishing',
                description: 'Post directly to LinkedIn with a single click. No copy-paste needed.',
                gradient: 'from-blue-500 to-cyan-600',
              },
              {
                icon: TrendingUp,
                title: 'Performance Analytics',
                description: 'Track engagement, reach, and growth with detailed analytics.',
                gradient: 'from-emerald-500 to-teal-600',
              },
              {
                icon: Clock,
                title: 'Smart Scheduling',
                description: 'Schedule posts for optimal engagement times automatically.',
                gradient: 'from-amber-500 to-orange-600',
              },
              {
                icon: Shield,
                title: 'Secure & Private',
                description: 'Your data is encrypted and never shared. Enterprise-grade security.',
                gradient: 'from-rose-500 to-pink-600',
              },
              {
                icon: Star,
                title: 'Custom Branding',
                description: 'Maintain your unique voice with customizable tone and style settings.',
                gradient: 'from-blue-500 to-purple-600',
              },
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -8 }}
                className="group bg-[#0b1234] rounded-2xl p-6 border border-white/10 shadow-lg hover:shadow-xl transition-all"
              >
                <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <feature.icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-slate-300">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Voxa Advantage */}
      <section className="py-24 px-4 sm:px-6 lg:px-8 bg-[#060a1f] border-y border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-white/10 text-cyan-200 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-white/10">
                <Lightbulb className="h-4 w-4" />
                Voxa Advantage
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Intelligence built for real LinkedIn workflows
              </h2>
              <p className="text-lg text-slate-300 mb-8">
                Voxa doesn&apos;t just generate posts. It coaches your cadence, evaluates your hooks, and keeps your brand voice consistent across every post.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                {[
                  {
                    icon: Target,
                    title: 'Voice DNA',
                    description: 'Capture your tone, cadence, and vocabulary so every post sounds like you.',
                  },
                  {
                    icon: Layers,
                    title: 'Post QA checklist',
                    description: 'Instant checks for hooks, CTAs, hashtags, and length before you publish.',
                  },
                  {
                    icon: Clock,
                    title: 'Cadence planner',
                    description: 'Stay consistent with smart reminders and next-best-action guidance.',
                  },
                  {
                    icon: TrendingUp,
                    title: 'Metrics mirror',
                    description: 'See LinkedIn engagement trends inside Voxa as soon as they update.',
                  },
                ].map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-[#0b1234] p-5">
                    <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                      <item.icon className="h-5 w-5 text-cyan-200" />
                    </div>
                    <h3 className="text-base font-semibold text-white mb-1">{item.title}</h3>
                    <p className="text-sm text-slate-400">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {[
                {
                  step: '01',
                  title: 'Brief the AI with your intent',
                  description: 'Set your audience, goal, and tone once. Voxa keeps it consistent.',
                },
                {
                  step: '02',
                  title: 'Draft with guardrails',
                  description: 'Hook suggestions, hashtag helpers, and post health checks guide every edit.',
                },
                {
                  step: '03',
                  title: 'Publish with confidence',
                  description: 'Schedule, publish, and track engagement without leaving Voxa.',
                },
              ].map((item) => (
                <div key={item.step} className="rounded-2xl border border-white/10 bg-[#0b1234] p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-xs font-semibold text-cyan-200 bg-white/10 px-3 py-1 rounded-full">
                      {item.step}
                    </span>
                    <h3 className="text-lg font-semibold text-white">{item.title}</h3>
                  </div>
                  <p className="text-sm text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Edge Features */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Edge features built for serious LinkedIn growth
              </h2>
              <p className="text-lg text-slate-300 max-w-3xl mx-auto">
                Strategic tooling that turns one-off posts into a repeatable content engine.
              </p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: 'Hook Lab',
                description: 'Generate and compare multiple first-line hooks with instant clarity scoring.',
                gradient: 'from-cyan-500 to-blue-600',
              },
              {
                title: 'Voice Lock',
                description: 'Keep tone, pacing, and vocabulary consistent across your entire content library.',
                gradient: 'from-blue-500 to-indigo-600',
              },
              {
                title: 'Cadence Planner',
                description: 'Auto-detect gaps in your schedule and suggest ideal posting slots.',
                gradient: 'from-indigo-500 to-purple-600',
              },
              {
                title: 'Engagement Signals',
                description: 'Track top-performing hooks, CTA formats, and formats in one dashboard.',
                gradient: 'from-purple-500 to-fuchsia-600',
              },
              {
                title: 'Content QA',
                description: 'Auto-check length, hashtags, emoji balance, and readability before publish.',
                gradient: 'from-emerald-500 to-teal-600',
              },
              {
                title: 'Brand-safe Publishing',
                description: 'Preview every post in context and approve before sending to LinkedIn.',
                gradient: 'from-amber-500 to-orange-600',
              },
            ].map((feature) => (
              <motion.div
                key={feature.title}
                whileHover={{ y: -6 }}
                className="group rounded-2xl border border-white/10 bg-[#0b1234] p-6"
              >
                <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="relative py-24 px-4 sm:px-6 lg:px-8 bg-[#070c28]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(640px_240px_at_50%_0%,rgba(25,213,255,0.22),transparent_70%),radial-gradient(520px_200px_at_80%_20%,rgba(122,43,255,0.2),transparent_75%)]" />
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Simple, transparent pricing
              </h2>
              <p className="text-xl text-slate-300">
                Pick the plan that matches your posting volume.
              </p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            <PricingCard
              name="Starter"
              price="$30"
              period="month"
              description="For consistent weekly posting"
              credits="25 posts per month"
              features={[
                '25 AI-generated posts/mo',
                'PDF, image, and video uploads',
                'Manual LinkedIn publishing',
                'Basic templates',
              ]}
              cta="Choose Starter"
            />
            <PricingCard
              name="Pro"
              price="$40"
              period="month"
              description="Everything included for creators"
              credits="30 posts per month"
              features={[
                '30 AI-generated posts/mo',
                'PDF, image, and video uploads',
                'Direct LinkedIn publishing',
                'Custom tone & style',
                'Analytics dashboard',
                'Priority support',
                'Voxa 1.0 image generation',
              ]}
              popular
              cta="Go Pro"
            />
            <PricingCard
              name="Pro+"
              price="$70"
              period="month"
              description="For high-volume creators & teams"
              credits="60 posts per month"
              features={[
                '60 AI-generated posts/mo',
                'Everything in Pro',
                'Voxa 1.5 image generation',
                'Team collaboration',
                'Advanced analytics',
                'Dedicated support',
              ]}
              cta="Go Pro+"
            />
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Loved by creators worldwide
              </h2>
              <p className="text-xl text-slate-300">
                See what our users have to say about Imaginevoxa.
              </p>
            </motion.div>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Testimonial
              quote="Imaginevoxa has completely transformed how I create content. What used to take me 2 hours now takes 5 minutes. My engagement has tripled!"
              author="Sarah Chen"
              role="Marketing Director"
              avatar="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop"
            />
            <Testimonial
              quote="The AI understands my voice perfectly. Every post feels authentic and gets amazing engagement. Best investment for my personal brand."
              author="Michael Roberts"
              role="Startup Founder"
              avatar="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop"
            />
            <Testimonial
              quote="I was skeptical about AI content, but Imaginevoxa changed my mind. The quality is incredible and my follower count has grown 10x."
              author="Emily Watson"
              role="Career Coach"
              avatar="https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop"
            />
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-voxa-gradient p-12 text-center"
          >
            {/* Background decoration */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
            
            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
                Ready to transform your LinkedIn presence?
              </h2>
              <p className="text-xl text-slate-100 mb-8 max-w-2xl mx-auto">
                Join thousands of creators who are saving time and growing their audience with Imaginevoxa.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/signup">
                  <Button size="lg" className="h-14 px-8 bg-white text-[#0B1028] hover:bg-slate-100 font-semibold text-lg">
                    Get Started <ChevronRight className="h-5 w-5 ml-2" />
                  </Button>
                </Link>
              </div>
              <p className="text-slate-200 text-sm mt-4">
                Plans start at $30/month - 25 posts included
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 px-4 sm:px-6 lg:px-8 bg-[#070c28] border-t border-white/10">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
            <div className="col-span-2">
              <Link href="/" className="mb-4 inline-block">
                <AnimatedLogo size="lg" />
              </Link>
              <p className="text-sm text-slate-400 mb-4 max-w-xs">
                AI-powered LinkedIn content creation for professionals. Create viral posts, grow your network, and build your personal brand.
              </p>
              {/* Social Links */}
              <div className="flex items-center gap-4">
                <a href="#" className="text-slate-500 hover:text-cyan-600 transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84"/></svg>
                </a>
                <a href="#" className="text-slate-500 hover:text-cyan-600 transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/></svg>
                </a>
                <a href="#" className="text-slate-500 hover:text-cyan-600 transition-colors">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                </a>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-3">
                <li><a href="#features" className="text-sm text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">Features</a></li>
                <li><a href="#pricing" className="text-sm text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">Pricing</a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-cyan-400 transition-colors">API <span className="text-xs bg-white/10 text-cyan-200 px-1.5 py-0.5 rounded-full ml-1">Soon</span></a></li>
                <li><a href="#" className="text-sm text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors">Changelog</a></li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <div className="space-y-3 text-sm text-slate-400">
                <p><span className="font-semibold text-slate-200">About Us:</span> We build AI workflows that turn LinkedIn posting into a consistent, brand-first routine.</p>
                <p><span className="font-semibold text-slate-200">Blog:</span> Practical playbooks on hooks, structure, cadence, and growth for busy professionals.</p>
                <p><span className="font-semibold text-slate-200">Careers:</span> We&apos;re building a world-class product team focused on creator outcomes.</p>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <div className="space-y-3 text-sm text-slate-400">
                <p><span className="font-semibold text-slate-200">Privacy:</span> We never sell data and only store what&apos;s needed to generate and publish posts.</p>
                <p><span className="font-semibold text-slate-200">Terms:</span> Clear usage terms to keep your content, assets, and workflow protected.</p>
                <p><span className="font-semibold text-slate-200">Cookies:</span> Used strictly for authentication and a smoother in-app experience.</p>
                <p><span className="font-semibold text-slate-200">GDPR:</span> Built with privacy by design, data minimization, and user control.</p>
              </div>
            </div>
          </div>
          
          {/* Bottom Bar */}
          <div className="pt-8 border-t border-white/10">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <p className="text-sm text-slate-400">
                © {new Date().getFullYear()} Imaginevoxa. All rights reserved.
              </p>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Shield className="h-4 w-4 text-green-500" />
                  <span>SSL Secured</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>GDPR Compliant</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <Check className="h-4 w-4 text-green-500" />
                  <span>SOC 2</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
