'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Sparkles,
  AlertCircle,
  Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedLogo } from '@/components/brand/animated-logo';
import { getClientAuthRedirectOrigin } from '@/lib/auth/redirect-origin';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [redirectPath, setRedirectPath] = useState<string>('/app');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
      const nextParam = params.get('next');
      if (!nextParam || !nextParam.startsWith('/') || nextParam.startsWith('//')) {
        setRedirectPath('/app');
      } else {
        setRedirectPath(nextParam);
      }
    } catch {
      setRedirectPath('/app');
    }
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    const checkSession = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data.session?.user) {
          router.replace(redirectPath);
        }
      } catch {
        // If session lookup fails, keep login usable.
      }
    };

    checkSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((event: string, session: { user?: unknown } | null) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        router.replace(redirectPath);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [redirectPath, router]);

  useEffect(() => {
    try {
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
      if (params.get('error') === 'auth_failed') {
        setError('Sign-in could not be completed. Please try again.');
      }
    } catch {
      // ignore
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      if (!data.session) {
        setError('Login succeeded but session was not established. Please try again.');
        return;
      }

      router.replace(redirectPath);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const supabase = createClient();
      const callbackUrl = new URL('/auth/callback', getClientAuthRedirectOrigin());
      callbackUrl.searchParams.set('next', redirectPath);

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
        },
      });

      if (authError) {
        setError(authError.message);
        setIsLoading(false);
      }
    } catch {
      setError('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-gray-50 text-gray-800">
      {/* Left Panel - Visual */}
      <div className="hidden lg:flex flex-1 bg-voxa-gradient relative overflow-hidden">
        {/* Grid pattern */}
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMC41IiBzdHJva2Utb3BhY2l0eT0iMC4xIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-50" />
        
        <div className="relative flex items-center justify-center w-full p-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="max-w-md text-white"
          >
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" />
              Welcome back
            </div>
            
            <h2 className="text-4xl font-bold mb-6">
              Pick up where you left off
            </h2>
            
            <p className="text-lg text-white/70 mb-8">
              Your AI-powered LinkedIn content assistant is ready to help you create engaging posts.
            </p>

            {/* Mock stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                <p className="text-3xl font-bold">2.5M+</p>
                <p className="text-sm text-white/60">Posts created</p>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-xl p-4">
                <p className="text-3xl font-bold">50K+</p>
                <p className="text-sm text-white/60">Happy users</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          {/* Logo */}
          <Link href="/" className="mb-8 inline-block">
            <AnimatedLogo size="lg" />
          </Link>

          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back
          </h1>
          <p className="text-gray-600 mb-8">
            Sign in to continue creating amazing content.
          </p>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-4 bg-red-50/20 border border-red-200 rounded-xl flex items-center gap-3 text-red-600">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Google Sign In */}
          <Button
            onClick={handleGoogleLogin}
            variant="outline"
            className="w-full h-12 mb-6 border-gray-200 text-gray-700 font-medium hover:bg-gray-100"
            disabled={isLoading}
          >
            <svg className="h-5 w-5 mr-3" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </Button>

          <div className="relative mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200/60" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-gray-500">
                or continue with email
              </span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full h-12 pl-10 pr-4 rounded-xl border border-gray-200/60 bg-gray-100 focus:ring-2 focus:ring-cyan-50 focus:border-transparent transition-all"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
                <Link href="/forgot-password" className="text-sm text-cyan-600 hover:text-cyan-700">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full h-12 pl-10 pr-12 rounded-xl border border-gray-200/60 bg-gray-100 focus:ring-2 focus:ring-cyan-50 focus:border-transparent transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 bg-voxa-gradient hover:opacity-90 text-white font-semibold rounded-xl shadow-lg shadow-voxa"
            >
              {isLoading ? (
                <div className="h-5 w-5 border-2 border-gray-300 border-t-white rounded-full animate-spin" />
              ) : (
                <>Sign In <ArrowRight className="h-5 w-5 ml-2" /></>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-cyan-600 hover:text-cyan-700 font-medium">
              Sign up
            </Link>
          </p>
          <p className="text-center text-xs text-gray-400 mt-4 flex items-center justify-center gap-2">
            <Shield className="h-4 w-4 text-cyan-600" />
            Passwords are hashed and managed by Supabase Auth. We never store them in plaintext.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
