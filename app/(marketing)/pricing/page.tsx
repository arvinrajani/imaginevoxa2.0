'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Check, 
  ArrowRight, 
  Sparkles,
  Zap,
  Building2,
  CreditCard,
  Shield,
  HelpCircle,
  X,
  Target,
  Lightbulb
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedLogo } from '@/components/brand/animated-logo';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'For consistent weekly posting',
    price: 30,
    period: 'month',
    credits: 30,
    creditsLabel: '30 posts per month',
    features: [
      '30 AI-generated posts/month',
      'PDF, image, and video uploads',
      'Copy & paste to LinkedIn',
      'Basic templates',
      'Community support',
    ],
    notIncluded: [
      'Voxa image generation',
      'Direct LinkedIn publishing',
      'Analytics dashboard',
    ],
    cta: 'Choose Starter',
    popular: false,
    gradient: 'from-slate-500 to-slate-600',
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Everything included for creators',
    price: 40,
    period: 'month',
    credits: 30,
    creditsLabel: '30 posts per month',
    features: [
      '30 AI-generated posts/month',
      'PDF, image, and video uploads',
      'Voxa 1.0 image generation',
      'Direct LinkedIn publishing',
      'Custom tone & style',
      'Analytics dashboard',
      'Priority support',
    ],
    notIncluded: [],
    cta: 'Go Pro',
    popular: true,
    gradient: 'from-cyan-50 via-blue-600 to-purple-600',
  },
  {
    id: 'business',
    name: 'Pro+',
    description: 'For high-volume creators & teams',
    price: 70,
    period: 'month',
    credits: 60,
    creditsLabel: '60 posts per month',
    features: [
      '60 AI-generated posts/month',
      'Everything in Pro',
      'Voxa 1.5 image generation',
      'Team collaboration',
      'Advanced analytics',
      'Dedicated support',
    ],
    notIncluded: [],
    cta: 'Go Pro+',
    popular: false,
    gradient: 'from-blue-600 via-indigo-600 to-purple-600',
  },
];

const faqs = [
  {
    q: 'How do credits work?',
    a: 'Each credit equals one AI-generated post. Credits refresh monthly based on your plan.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes! You can cancel your subscription at any time. You\'ll retain access until the end of your billing period.',
  },
  {
    q: 'Do I need a credit card to start?',
    a: 'All plans require payment info at signup. You can cancel anytime.',
  },
  {
    q: 'What happens if I run out of credits?',
    a: 'You can purchase additional credits or upgrade your plan. We\'ll notify you when you\'re running low.',
  },
  {
    q: 'Is my LinkedIn account safe?',
    a: 'Absolutely. We use official LinkedIn OAuth and never store your password. You can disconnect anytime.',
  },
];

function PricingCard({ plan, isYearly }: { plan: typeof plans[0]; isYearly: boolean }) {
  const router = useRouter();
  const yearlyPrice = plan.price > 0 ? Math.floor(plan.price * 10) : 0;
  const displayPrice = isYearly ? yearlyPrice : plan.price;
  const period = isYearly ? 'year' : 'month';
  const savings = isYearly && plan.price > 0 ? plan.price * 12 - yearlyPrice : 0;
  const iconClass = plan.popular ? 'text-gray-900' : 'text-cyan-600';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -6, transition: { duration: 0.2 } }}
      className="relative h-full"
    >
      <div
        className={`relative h-full rounded-2xl border backdrop-blur ${
          plan.popular ? 'border-cyan-400/40 bg-white/80' : 'border-gray-200/60 bg-white/80'
        }`}
      >
        <div
          className={`absolute inset-x-8 top-0 h-px ${
            plan.popular
              ? 'bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent'
              : 'bg-gradient-to-r from-transparent via-white/15 to-transparent'
          }`}
        />
        {plan.popular && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <span className="bg-gray-100 text-cyan-100 text-xs font-semibold px-4 py-1.5 rounded-full border border-gray-200/60 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              MOST POPULAR
            </span>
          </div>
        )}

        <div className="p-8 h-full flex flex-col text-gray-800">

      <div className="mb-6">
        <div
          className={`inline-flex items-center justify-center h-12 w-12 rounded-xl mb-4 border ${
            plan.popular ? 'bg-gray-100 border-gray-200/60' : 'bg-gray-50 border-gray-200/60'
          }`}
        >
          {plan.id === 'starter' && <Zap className={`h-6 w-6 ${iconClass}`} />}
          {plan.id === 'pro' && <Sparkles className={`h-6 w-6 ${iconClass}`} />}
          {plan.id === 'business' && <Building2 className={`h-6 w-6 ${iconClass}`} />}
        </div>
        <h3 className="text-xl font-semibold mb-2 text-gray-900">
          {plan.name}
        </h3>
        <p className="text-sm text-gray-600">
          {plan.description}
        </p>
      </div>

      <div className="mb-6">
        <div className="flex items-baseline gap-1">
          <span className="text-5xl font-bold text-gray-900">
            ${displayPrice}
          </span>
          <span className="text-gray-500">/{period}</span>
        </div>
        {savings > 0 && (
          <p className="text-sm text-emerald-300 mt-1 font-medium">
            Save ${savings}/year
          </p>
        )}
        <div className="flex items-center gap-2 mt-2 text-gray-500">
          <CreditCard className="h-4 w-4" />
          <span className="text-sm">{plan.creditsLabel}</span>
        </div>
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-3">
            <div
              className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white/10"
            >
              <Check
                className="h-3 w-3 text-cyan-600"
              />
            </div>
            <span className="text-sm text-gray-700">
              {feature}
            </span>
          </li>
        ))}
        {plan.notIncluded.map((feature, i) => (
          <li key={`not-${i}`} className="flex items-start gap-3 opacity-50">
            <div className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 bg-white/5">
              <X className="h-3 w-3 text-gray-500" />
            </div>
            <span className="text-sm line-through text-gray-500">
              {feature}
            </span>
          </li>
        ))}
      </ul>

      <Button
        onClick={() => router.push('/signup')}
        className={`w-full h-12 font-semibold rounded-xl transition-all ${
          plan.popular
            ? 'bg-white text-[#0B1028] hover:bg-slate-100'
            : 'bg-gray-100 text-gray-900 border border-gray-200/60 hover:bg-white/15'
        }`}
      >
        {plan.cta}
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>

      {plan.price > 0 && (
        <p className="text-xs text-center mt-3 text-gray-500">
          Cancel anytime
        </p>
      )}
        </div>
      </div>
    </motion.div>
  );
}

function FAQ({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div
      className="border border-gray-200/60 rounded-xl overflow-hidden bg-white/70"
      initial={false}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium text-gray-800">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <X className="h-5 w-5 text-gray-500" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0, opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="overflow-hidden"
      >
        <p className="px-6 pb-4 text-gray-600">
          {answer}
        </p>
      </motion.div>
    </motion.div>
  );
}

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <div className="min-h-screen bg-transparent text-gray-800">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/75 backdrop-blur-xl border-b border-gray-200/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-3">
              <AnimatedLogo size="lg" />
            </Link>
            
            <div className="hidden lg:flex items-center gap-2 rounded-full border border-gray-200/60 bg-gray-50 px-2 py-1 text-sm font-medium text-gray-600">
              <Link href="/#features" className="px-3 py-1 rounded-full hover:bg-gray-100 hover:text-gray-900 transition-colors">Features</Link>
              <Link href="/pricing" className="px-3 py-1 rounded-full bg-gray-100 text-gray-900 transition-colors">Pricing</Link>
              <Link href="/demo" className="px-3 py-1 rounded-full hover:bg-gray-100 hover:text-gray-900 transition-colors">Demo</Link>
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

      {/* Header */}
      <section className="pt-32 pb-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="inline-flex items-center gap-2 bg-gray-100 text-cyan-600 px-4 py-2 rounded-full text-sm font-medium mb-6 border border-gray-200/60">
              <Shield className="h-4 w-4" />
              Simple, Transparent Pricing
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 mb-4">
              Choose the perfect plan for your{' '}
              <span className="text-voxa-gradient">
                growth
              </span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-8">
              Choose a plan that matches your posting volume. Cancel anytime.
            </p>

            {/* Billing Toggle */}
            <div className="inline-flex items-center gap-4 bg-gray-50 rounded-full p-1.5 border border-gray-200/60">
              <button
                onClick={() => setIsYearly(false)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                  !isYearly
                    ? 'bg-gray-100 text-gray-900 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsYearly(true)}
                className={`px-6 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                  isYearly
                    ? 'bg-gray-100 text-gray-900 shadow-sm'
                    : 'text-gray-600'
                }`}
              >
                Yearly
                <span className="bg-emerald-50/15 text-emerald-200 text-xs font-bold px-2 py-0.5 rounded-full">
                  Save 17%
                </span>
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative pb-24 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(600px_240px_at_50%_0%,rgba(25,213,255,0.18),transparent_70%),radial-gradient(520px_220px_at_80%_15%,rgba(122,43,255,0.16),transparent_75%)]" />
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8 items-stretch">
            {plans.map((plan, i) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <PricingCard plan={plan} isYearly={isYearly} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Comparison */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 border-y border-gray-200/60">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-12">
            Compare Plans
          </h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200/60">
                  <th className="text-left py-4 px-4 font-medium text-gray-500">Feature</th>
                  <th className="text-center py-4 px-4 font-medium text-gray-500">Starter</th>
                  <th className="text-center py-4 px-4 font-medium text-cyan-600">Pro</th>
                  <th className="text-center py-4 px-4 font-medium text-gray-500">Pro+</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {[
                  { feature: 'AI Post Generation', starter: '25/month', pro: '30/month', business: '60/month' },
                  { feature: 'PDF, Image & Video Uploads', starter: true, pro: true, business: true },
                  { feature: 'Direct LinkedIn Publish', starter: false, pro: true, business: true },
                  { feature: 'Voxa Image Generation', starter: false, pro: 'Voxa 1.0', business: 'Voxa 1.5' },
                  { feature: 'Custom Tone & Style', starter: false, pro: true, business: true },
                  { feature: 'Analytics Dashboard', starter: false, pro: true, business: true },
                  { feature: 'Multiple Accounts', starter: false, pro: false, business: true },
                  { feature: 'Team Collaboration', starter: false, pro: false, business: true },
                  { feature: 'Priority Support', starter: false, pro: true, business: true },
                ].map((row, i) => (
                  <tr key={i}>
                    <td className="py-4 px-4 text-gray-800">{row.feature}</td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.starter === 'boolean' ? (
                        row.starter ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-slate-600 mx-auto" />
                        )
                      ) : (
                        <span className="text-gray-600">{row.starter}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center bg-cyan-50">
                      {typeof row.pro === 'boolean' ? (
                        row.pro ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-slate-600 mx-auto" />
                        )
                      ) : (
                        <span className="text-cyan-600 font-medium">{row.pro}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof row.business === 'boolean' ? (
                        row.business ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-slate-600 mx-auto" />
                        )
                      ) : (
                        <span className="text-gray-600">{row.business}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Voxa Difference */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 bg-gray-100 text-cyan-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <Lightbulb className="h-4 w-4" />
              Why Voxa wins
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-3">Designed for consistent posting</h2>
            <p className="text-gray-600">
              Most tools generate text. Voxa layers strategy, pacing, and quality checks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Sparkles,
                title: 'Voice consistency',
                description: 'Tone controls and style tuning keep every post on-brand.',
              },
              {
                icon: Target,
                title: 'Post QA baked in',
                description: 'Hook, CTA, and length checks before you publish.',
              },
              {
                icon: Zap,
                title: 'Workflow ready',
                description: 'Upload PDFs, images, or video and publish in one flow.',
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-200/60 bg-white p-6">
                <div className="h-11 w-11 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                  <item.icon className="h-5 w-5 text-cyan-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.title}</h3>
                <p className="text-sm text-gray-500">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 bg-gray-100 text-cyan-600 px-4 py-2 rounded-full text-sm font-medium mb-4">
              <HelpCircle className="h-4 w-4" />
              FAQ
            </div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-600">
              Everything you need to know about our pricing
            </p>
          </motion.div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <FAQ question={faq.q} answer={faq.a} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl bg-voxa-gradient p-12 text-center"
          >
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30" />
            
            <div className="relative">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Still have questions?
              </h2>
              <p className="text-xl text-gray-800 mb-8">
                Our team is here to help you choose the right plan.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link href="/signup">
                  <Button size="lg" className="h-12 px-8 bg-white text-[#0B1028] hover:bg-slate-100 font-semibold">
                    Get Started
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button size="lg" variant="outline" className="h-12 px-8 border-gray-300 text-gray-700 hover:bg-gray-100">
                    Contact Sales
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 sm:px-6 lg:px-8 border-t border-gray-200/60">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-sm text-gray-500">
            © {new Date().getFullYear()} Imaginevoxa. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
