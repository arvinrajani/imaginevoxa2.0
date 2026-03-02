'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crown, Zap, Building2, Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DevUpgradePage() {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleUpgrade = async (plan: string) => {
    setLoading(plan);
    setSuccess(null);
    
    try {
      const res = await fetch('/api/dev-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      
      const data = await res.json();
      
      if (data.success) {
        setSuccess(plan);
        setTimeout(() => {
          router.push('/app/generate');
        }, 1500);
      }
    } catch (error) {
      console.error('Upgrade failed:', error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🛠️ Dev Mode: Switch Plan
          </h1>
          <p className="text-gray-500">
            Click a plan to instantly switch (for testing only)
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Starter */}
          <button
            onClick={() => handleUpgrade('starter')}
            disabled={loading !== null}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              success === 'starter'
                ? 'border-green-50 bg-green-50/20'
                : 'border-gray-200 bg-white hover:border-gray-400'
            }`}
          >
            <div className="h-12 w-12 rounded-xl bg-gray-50 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Starter</h3>
            <p className="text-sm text-gray-500 mb-4">25 posts, uploads, manual publish</p>
            {loading === 'starter' ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
            ) : success === 'starter' ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <span className="text-sm text-gray-400">Click to switch</span>
            )}
          </button>

          {/* Pro */}
          <button
            onClick={() => handleUpgrade('pro')}
            disabled={loading !== null}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              success === 'pro'
                ? 'border-green-400 bg-green-50/20'
                : 'border-cyan-200 bg-gradient-to-br from-cyan-50 to-blue-50/20 hover:border-cyan-400'
            }`}
          >
            <div className="h-12 w-12 rounded-xl bg-voxa-gradient flex items-center justify-center mb-4">
              <Crown className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Pro</h3>
            <p className="text-sm text-gray-500 mb-4">30 posts, Voxa images, publish</p>
            {loading === 'pro' ? (
              <Loader2 className="h-5 w-5 animate-spin text-cyan-500" />
            ) : success === 'pro' ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <span className="text-sm text-cyan-600 font-medium">Click to switch</span>
            )}
          </button>

          {/* Pro+ */}
          <button
            onClick={() => handleUpgrade('business')}
            disabled={loading !== null}
            className={`p-6 rounded-2xl border-2 text-left transition-all ${
              success === 'business'
                ? 'border-green-50 bg-green-50/20'
                : 'border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50/20 hover:border-amber-400'
            }`}
          >
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center mb-4">
              <Building2 className="h-6 w-6 text-white" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Pro+</h3>
            <p className="text-sm text-gray-500 mb-4">60 posts, Voxa 1.5, team features</p>
            {loading === 'business' ? (
              <Loader2 className="h-5 w-5 animate-spin text-amber-500" />
            ) : success === 'business' ? (
              <Check className="h-5 w-5 text-green-500" />
            ) : (
              <span className="text-sm text-amber-600 font-medium">Click to switch</span>
            )}
          </button>
        </div>

        {success && (
          <div className="mt-6 text-center">
            <p className="text-green-600 font-medium">
              ✅ Switched to {success.charAt(0).toUpperCase() + success.slice(1)} plan! Redirecting...
            </p>
          </div>
        )}

        <div className="mt-8 text-center">
          <Button variant="outline" onClick={() => router.push('/app/generate')}>
            Go to Generate Page
          </Button>
        </div>
      </div>
    </div>
  );
}
