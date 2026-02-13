'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import {
  User,
  CreditCard,
  Bell,
  Shield,
  Download,
  Trash2,
  Check,
  Palette,
  Globe,
  Zap,
  AlertTriangle,
  Crown,
  Loader2
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/client';

type SettingsTab = 'profile' | 'billing' | 'notifications' | 'security' | 'data';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data & Privacy', icon: Download },
];

// Plan configurations
const PLANS = {
  starter: { name: 'Starter', price: 30, credits: 25, features: ['25 posts/month', 'PDF, image, and video uploads', 'Manual LinkedIn publishing'] },
  pro: { name: 'Pro', price: 40, credits: 30, features: ['30 posts/month', 'Everything included', 'Direct LinkedIn posting', 'Voxa 1.0 image generation'] },
  business: { name: 'Pro+', price: 70, credits: 60, features: ['60 posts/month', 'Everything in Pro', 'Voxa 1.5 image generation', 'Team collaboration', 'Priority support'] }
};

type UserData = {
  id: string;
  name: string;
  email: string;
  plan: 'starter' | 'pro' | 'business';
  creditsUsed: number;
  creditsTotal: number;
  memberSince: string;
};

function ProfileSettings({ userData, onUpdate }: { userData: UserData; onUpdate: () => void }) {
  const [name, setName] = useState(userData.name);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();
    
    await supabase
      .from('profiles')
      .upsert({ id: userData.id, full_name: name });
    
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Profile Information
        </h3>
        
        {/* Avatar */}
        <div className="flex items-center gap-6 mb-6">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold">
            {name.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{name || 'User'}</p>
            <p className="text-sm text-gray-500">{userData.email}</p>
            <p className="text-xs text-gray-400 mt-1">Member since {new Date(userData.memberSince).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={userData.email}
              disabled
              className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Contact support to change your email</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || name === userData.name}
            className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="h-4 w-4 mr-2" />
                Saved!
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Preferences */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Preferences
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Theme</p>
                <p className="text-sm text-gray-500">Choose your preferred theme</p>
              </div>
            </div>
            <select className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <option>System</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Default Tone</p>
                <p className="text-sm text-gray-500">Default tone for generated posts</p>
              </div>
            </div>
            <select className="h-10 px-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
              <option>Professional</option>
              <option>Casual</option>
              <option>Bold</option>
              <option>Inspirational</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function BillingSettings({ userData }: { userData: UserData }) {
  const plan = PLANS[userData.plan];
  const creditsRemaining = Math.max(0, userData.creditsTotal - userData.creditsUsed);
  const creditPercentage = userData.creditsTotal > 0 ? (userData.creditsUsed / userData.creditsTotal) * 100 : 0;
  
  // Calculate days until reset
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysUntilReset = Math.ceil((endOfMonth.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="space-y-6">
      {/* Current Plan */}
      <div className={`rounded-2xl p-6 text-white ${
        userData.plan === 'starter' 
          ? 'bg-gradient-to-br from-gray-600 to-gray-700' 
          : 'bg-gradient-to-br from-violet-500 to-blue-600'
      }`}>
        <div className="flex items-center gap-2 mb-4">
          {userData.plan !== 'starter' && <Crown className="h-5 w-5 text-amber-300" />}
          <span className="font-semibold">{plan.name} Plan</span>
        </div>
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-4xl font-bold">${plan.price}</span>
          <span className="text-white/70">/month</span>
        </div>
        {userData.plan === 'starter' ? (
          <p className="text-white/80 mb-4">
            You&apos;re on the Starter plan. Upgrade to unlock Voxa image generation and direct publishing!
          </p>
        ) : userData.plan === 'pro' ? (
          <p className="text-white/80 mb-4">
            You&apos;re on the Pro plan. Upgrade to Pro+ for higher posting limits.
          </p>
        ) : (
          <p className="text-white/80 mb-4">
            Thanks for being a Pro+ member!
          </p>
        )}
        <div className="flex gap-3">
          <Link href="/pricing">
            <Button className="bg-white text-violet-600 hover:bg-gray-100">
              {userData.plan === 'starter' ? 'Upgrade Plan' : 'Change Plan'}
            </Button>
          </Link>
          <Button variant="outline" className="border-white/30 text-white hover:bg-white/10">
            Cancel Subscription
          </Button>
        </div>
      </div>

      {/* Plan Features */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Plan Features
        </h3>
        <ul className="space-y-3">
          {plan.features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3 text-gray-600 dark:text-gray-400">
              <Check className="h-5 w-5 text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Credits Usage */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Credits Usage
        </h3>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold text-gray-900 dark:text-white">
            {creditsRemaining}
          </span>
          <span className="text-gray-500">/ {userData.creditsTotal} credits remaining</span>
        </div>
        <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, 100 - creditPercentage)}%` }}
            className="h-full bg-voxa-gradient rounded-full"
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500">{userData.creditsUsed} credits used this month</span>
          <span className="text-gray-500">Resets in {daysUntilReset} days</span>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Billing History
        </h3>
        <div className="text-center py-8">
          <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-2">No billing history yet</p>
          <p className="text-sm text-gray-400">
            Payment integration is coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}

function NotificationSettings() {
  const [notifications, setNotifications] = useState({
    postPublished: true,
    postFailed: true,
    weeklyDigest: false,
    productUpdates: true,
  });

  const toggleNotification = (key: keyof typeof notifications) => {
    setNotifications(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const notificationOptions = [
    { key: 'postPublished' as const, title: 'Post Published', description: 'Get notified when your post is published to LinkedIn' },
    { key: 'postFailed' as const, title: 'Post Failed', description: 'Get notified if a scheduled post fails' },
    { key: 'weeklyDigest' as const, title: 'Weekly Digest', description: 'Receive a weekly summary of your content performance' },
    { key: 'productUpdates' as const, title: 'Product Updates', description: 'Learn about new features and improvements' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Email Notifications
        </h3>
        <div className="space-y-3">
          {notificationOptions.map(option => (
            <div
              key={option.key}
              className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl"
            >
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{option.title}</p>
                <p className="text-sm text-gray-500">{option.description}</p>
              </div>
              <button
                onClick={() => toggleNotification(option.key)}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  notifications[option.key] ? 'bg-violet-600' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                    notifications[option.key] ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SecuritySettings({ userData }: { userData: UserData }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Security Settings
        </h3>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-gray-900 dark:text-white">Password</p>
              <Button variant="outline" size="sm">Change Password</Button>
            </div>
            <p className="text-sm text-gray-500">
              Last changed: Never
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-gray-900 dark:text-white">Two-Factor Authentication</p>
              <Button variant="outline" size="sm">Enable</Button>
            </div>
            <p className="text-sm text-gray-500">
              Add an extra layer of security to your account
            </p>
          </div>
          <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <p className="font-medium text-gray-900 dark:text-white mb-2">Active Sessions</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Current session</p>
                <p className="text-xs text-gray-500">Windows • Chrome • Active now</p>
              </div>
              <span className="text-xs bg-green-100 dark:bg-green-900/50 text-green-600 px-2 py-1 rounded-full">
                Current
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DataSettings({ userData, onDeleteData }: { userData: UserData; onDeleteData: () => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteData = async () => {
    if (deleteInput !== 'DELETE') return;
    
    setIsDeleting(true);
    const supabase = createClient();
    
    // Delete all user's posts
    await supabase.from('posts').delete().eq('user_id', userData.id);
    
    // Delete LinkedIn connections
    await supabase.from('linkedin_connections').delete().eq('user_id', userData.id);
    
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setDeleteInput('');
    onDeleteData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Export Data
        </h3>
        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
          <p className="text-gray-600 dark:text-gray-400 mb-3">
            Download a copy of all your data including posts, settings, and activity.
          </p>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export All Data
          </Button>
        </div>
      </div>

      <hr className="border-gray-200 dark:border-gray-700" />

      <div>
        <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h3>
        
        <div className="p-4 border border-red-200 dark:border-red-900 rounded-xl bg-red-50 dark:bg-red-900/20">
          <p className="font-medium text-gray-900 dark:text-white mb-2">Delete All Data</p>
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete all your posts, drafts, and LinkedIn connections. This action cannot be undone.
          </p>
          
          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Data
            </Button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-red-600 font-medium">
                Type &quot;DELETE&quot; to confirm:
              </p>
              <input
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-gray-900"
                placeholder="DELETE"
              />
              <div className="flex gap-2">
                <Button
                  onClick={handleDeleteData}
                  disabled={deleteInput !== 'DELETE' || isDeleting}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Confirm Delete'
                  )}
                </Button>
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border border-red-200 dark:border-red-900 rounded-xl bg-red-50 dark:bg-red-900/20 mt-4">
          <p className="font-medium text-gray-900 dark:text-white mb-2">Delete Account</p>
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete your account and all associated data.
          </p>
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-100 dark:hover:bg-red-900/50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Account
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const userQuery = useQuery({
    queryKey: ['settings-user'],
    queryFn: async (): Promise<UserData> => {
      const supabase = createClient();
      
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Unauthorized');
      }

      // Get profile
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1);
      const profile = profileRows?.[0] ?? null;

      // Get posts this month
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const { data: posts } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString());

      const postsThisMonth = posts?.length || 0;

      const plan: 'starter' | 'pro' | 'business' =
        profile?.plan === 'pro' || profile?.plan === 'business' ? profile.plan : 'starter';
      const creditsTotal = PLANS[plan].credits;

      return {
        id: user.id,
        name: profile?.full_name || user.email?.split('@')[0] || 'User',
        email: user.email || '',
        plan,
        creditsUsed: postsThisMonth,
        creditsTotal,
        memberSince: profile?.created_at || user.created_at || new Date().toISOString(),
      };
    },
  });

  const userData = userQuery.data ?? null;

  if (userQuery.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (userQuery.isError || !userData) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-500">
        Unable to load settings right now.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500">Manage your account settings and preferences</p>
      </div>

      <div className="flex flex-col md:flex-row gap-8">
        {/* Sidebar */}
        <div className="md:w-56 shrink-0">
          <nav className="space-y-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                  activeTab === tab.id
                    ? 'bg-violet-100 dark:bg-violet-900/50 text-violet-600 dark:text-violet-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                <span className="font-medium">{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'profile' && <ProfileSettings userData={userData} onUpdate={() => userQuery.refetch()} />}
            {activeTab === 'billing' && <BillingSettings userData={userData} />}
            {activeTab === 'notifications' && <NotificationSettings />}
            {activeTab === 'security' && <SecuritySettings userData={userData} />}
            {activeTab === 'data' && <DataSettings userData={userData} onDeleteData={() => userQuery.refetch()} />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
