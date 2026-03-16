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
  AlertTriangle,
  Crown,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { BillingAlert, BillingSnapshot } from '@/lib/billing/client';
import { useBillingSnapshot } from '@/lib/billing/use-billing-snapshot';
import { createClient } from '@/lib/supabase/client';

type SettingsTab = 'profile' | 'billing' | 'notifications' | 'security' | 'data';

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'billing', label: 'Billing & Plan', icon: CreditCard },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'data', label: 'Data & Privacy', icon: Download },
];

type UserData = BillingSnapshot;

const BILLING_ALERT_STYLES: Record<BillingAlert['tone'], string> = {
  info: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
};

function formatBillingEventTitle(type: string) {
  const normalized = String(type || 'billing_update')
    .replace(/[_-]+/g, ' ')
    .trim();

  if (!normalized) return 'Billing update';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatBillingAmount(amount: number | null) {
  if (typeof amount !== 'number' || Number.isNaN(amount)) return null;
  const prefix = amount > 0 ? '+' : '';
  return `${prefix}${amount}`;
}

function ProfileSettings({ userData, onUpdate }: { userData: UserData; onUpdate: () => void }) {
  const [name, setName] = useState(userData.name);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    const supabase = createClient();

    await supabase
      .from('profiles')
      .upsert({ id: userData.userId, full_name: name });

    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onUpdate();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Profile Information
        </h3>

        {/* Avatar */}
        <div className="flex items-center gap-6 mb-6">
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white text-2xl font-bold">
            {name.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
          </div>
          <div>
            <p className="font-medium text-gray-900">{name || 'User'}</p>
            <p className="text-sm text-gray-500">{userData.email}</p>
            <p className="text-xs text-gray-400 mt-1">Member since {new Date(userData.memberSince).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Full Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-white focus:ring-2 focus:ring-violet-50 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={userData.email}
              disabled
              className="w-full h-11 px-4 rounded-xl border border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed"
            />
            <p className="text-xs text-gray-500 mt-1">Contact support to change your email</p>
          </div>
          <Button
            onClick={handleSave}
            disabled={isSaving || name === userData.name}
            className="bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-500 hover:from-violet-700 hover:to-blue-700 text-white"
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

      <hr className="border-gray-200" />

      {/* Preferences */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Preferences
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900">Theme</p>
                <p className="text-sm text-gray-500">Choose your preferred theme</p>
              </div>
            </div>
            <select className="h-10 px-4 rounded-lg border border-gray-200 bg-white">
              <option>System</option>
              <option>Light</option>
              <option>Dark</option>
            </select>
          </div>
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <Globe className="h-5 w-5 text-gray-500" />
              <div>
                <p className="font-medium text-gray-900">Default Tone</p>
                <p className="text-sm text-gray-500">Default tone for generated posts</p>
              </div>
            </div>
            <select className="h-10 px-4 rounded-lg border border-gray-200 bg-white">
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

function BillingSettings({
  userData,
  onRefresh,
  isRefreshing,
}: {
  userData: UserData;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  const creditsRemaining = userData.creditsUnlimited ? null : Math.max(0, userData.creditsRemaining);
  const creditPercentage =
    !userData.creditsUnlimited && userData.creditsTotal > 0
      ? (userData.creditsUsed / userData.creditsTotal) * 100
      : 0;

  const now = new Date();
  const fallbackPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const periodEnd = userData.subscriptionPeriodEnd
    ? new Date(userData.subscriptionPeriodEnd)
    : fallbackPeriodEnd;
  const hasPeriodEnd = Number.isFinite(periodEnd.getTime());
  const daysUntilReset = hasPeriodEnd
    ? Math.max(0, Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <div className="space-y-6">
      {userData.alerts.length > 0 && (
        <div className="space-y-3">
          {userData.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-xl border px-4 py-3 ${BILLING_ALERT_STYLES[alert.tone]}`}
            >
              <p className="text-sm font-semibold">{alert.title}</p>
              <p className="mt-1 text-sm opacity-90">{alert.description}</p>
            </div>
          ))}
        </div>
      )}

      <div
        className={`rounded-2xl p-6 text-white ${userData.plan === 'starter'
            ? 'bg-gradient-to-br from-slate-700 to-slate-800'
            : 'bg-gradient-to-br from-violet-500 to-blue-600'
          }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              {userData.plan !== 'starter' && <Crown className="h-5 w-5 text-amber-300" />}
              <span className="font-semibold">{userData.planName} Plan</span>
              {userData.subscriptionStatus ? (
                <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/90">
                  {userData.subscriptionStatus.replace(/_/g, ' ')}
                </span>
              ) : null}
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/90">
                {userData.billingSource === 'live' ? 'Live sync' : 'Estimated'}
              </span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-4xl font-bold">${userData.planPriceMonthly}</span>
              <span className="text-white/70">/month</span>
            </div>
            {userData.plan === 'starter' ? (
              <p className="text-white/85 mb-4 max-w-xl">
                Upgrade to unlock direct publishing, better image generation, and more monthly credits.
              </p>
            ) : userData.plan === 'pro' ? (
              <p className="text-white/85 mb-4 max-w-xl">
                Pro is active. Move to Pro+ if you need more credits and collaboration capacity.
              </p>
            ) : (
              <p className="text-white/85 mb-4 max-w-xl">
                Pro+ is active with the highest credit tier and the most complete Studio workflow.
              </p>
            )}
          </div>
          <Button
            variant="outline"
            className="border-white/30 bg-white/10 text-white hover:bg-white/20"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Billing
          </Button>
        </div>

        <div className="flex gap-3">
          <Link href="/pricing">
            <Button className="bg-white text-violet-600 hover:bg-gray-100">
              {userData.plan === 'starter' ? 'Upgrade Plan' : 'Change Plan'}
            </Button>
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Plan Features
        </h3>
        <ul className="space-y-3">
          {userData.planFeatures.map((feature, index) => (
            <li key={`${feature}-${index}`} className="flex items-center gap-3 text-gray-600">
              <Check className="h-5 w-5 text-green-500" />
              {feature}
            </li>
          ))}
        </ul>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            Credits Usage
          </h3>
          {hasPeriodEnd ? (
            <span className="text-xs text-gray-500">
              Current period ends {periodEnd.toLocaleDateString()}
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold text-gray-900">
            {userData.creditsUnlimited ? 'Unlimited' : creditsRemaining}
          </span>
          <span className="text-gray-500">
            {userData.creditsUnlimited ? 'credits available' : `/ ${userData.creditsTotal} credits remaining`}
          </span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: userData.creditsUnlimited ? '100%' : `${Math.min(100, 100 - creditPercentage)}%` }}
            className="h-full bg-voxa-gradient rounded-full"
          />
        </div>
        <div className="flex flex-col gap-2 text-sm text-gray-500 sm:flex-row sm:items-center sm:justify-between">
          <span>{userData.creditsUsed} credits used this billing period</span>
          <span>
            {daysUntilReset === null ? 'Billing period end unavailable' : `Resets in ${daysUntilReset} day${daysUntilReset === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Recent Billing Activity
        </h3>
        {userData.events.length > 0 ? (
          <div className="space-y-3">
            {userData.events.map((event) => {
              const amountLabel = formatBillingAmount(event.amount);
              return (
                <div
                  key={event.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900">
                      {event.description || formatBillingEventTitle(event.type)}
                    </p>
                    <p className="text-sm text-gray-500">
                      {formatBillingEventTitle(event.type)} • {new Date(event.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {amountLabel ? (
                      <p className={`font-semibold ${event.amount && event.amount > 0 ? 'text-emerald-600' : 'text-gray-700'}`}>
                        {amountLabel}
                      </p>
                    ) : null}
                    {event.balanceAfter !== null ? (
                      <p className="text-xs text-gray-500">Balance {event.balanceAfter}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8">
            <CreditCard className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No recent billing events</p>
            <p className="text-sm text-gray-400">
              Credit refreshes and payment-related activity will appear here automatically.
            </p>
          </div>
        )}
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
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Email Notifications
        </h3>
        <div className="space-y-3">
          {notificationOptions.map(option => (
            <div
              key={option.key}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
            >
              <div>
                <p className="font-medium text-gray-900">{option.title}</p>
                <p className="text-sm text-gray-500">{option.description}</p>
              </div>
              <button
                onClick={() => toggleNotification(option.key)}
                className={`relative w-12 h-6 rounded-full transition-colors ${notifications[option.key] ? 'bg-violet-600' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${notifications[option.key] ? 'left-7' : 'left-1'
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

function SecuritySettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Security Settings
        </h3>
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-gray-900">Password</p>
              <Button variant="outline" size="sm">Change Password</Button>
            </div>
            <p className="text-sm text-gray-500">
              Last changed: Never
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-gray-900">Two-Factor Authentication</p>
              <Button variant="outline" size="sm">Enable</Button>
            </div>
            <p className="text-sm text-gray-500">
              Add an extra layer of security to your account
            </p>
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <p className="font-medium text-gray-900 mb-2">Active Sessions</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Current session</p>
                <p className="text-xs text-gray-500">Windows • Chrome • Active now</p>
              </div>
              <span className="text-xs bg-green-100/50 text-green-600 px-2 py-1 rounded-full">
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
    await supabase.from('posts').delete().eq('user_id', userData.userId);

    // Delete LinkedIn connections
    await supabase.from('linkedin_connections').delete().eq('user_id', userData.userId);

    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setDeleteInput('');
    onDeleteData();
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Export Data
        </h3>
        <div className="p-4 bg-gray-50 rounded-xl">
          <p className="text-gray-600 mb-3">
            Download a copy of all your data including posts, settings, and activity.
          </p>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export All Data
          </Button>
        </div>
      </div>

      <hr className="border-gray-200" />

      <div>
        <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5" />
          Danger Zone
        </h3>

        <div className="p-4 border border-red-200 rounded-xl bg-red-50/20">
          <p className="font-medium text-gray-900 mb-2">Delete All Data</p>
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete all your posts, drafts, and LinkedIn connections. This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <Button
              variant="outline"
              className="border-red-300 text-red-600 hover:bg-red-100/50"
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
                className="w-full h-10 px-3 rounded-lg border border-red-300 bg-white"
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

        <div className="p-4 border border-red-200 rounded-xl bg-red-50/20 mt-4">
          <p className="font-medium text-gray-900 mb-2">Delete Account</p>
          <p className="text-sm text-gray-500 mb-4">
            Permanently delete your account and all associated data.
          </p>
          <Button
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-100/50"
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
  const billingQuery = useBillingSnapshot();
  const userData = billingQuery.data ?? null;

  const refreshBilling = async () => {
    const result = await billingQuery.refetch();
    if (result.data) {
      toast.success('Billing refreshed');
    }
  };

  if (billingQuery.isLoading && !userData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  if (billingQuery.isError || !userData) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-500">
        Unable to load settings right now.
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${activeTab === tab.id
                    ? 'bg-violet-100/50 text-violet-600'
                    : 'text-gray-600 hover:bg-gray-100'
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
            {activeTab === 'profile' && <ProfileSettings userData={userData} onUpdate={() => void billingQuery.refetch()} />}
            {activeTab === 'billing' && (
              <BillingSettings
                userData={userData}
                onRefresh={() => void refreshBilling()}
                isRefreshing={billingQuery.isFetching}
              />
            )}
            {activeTab === 'notifications' && <NotificationSettings />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'data' && <DataSettings userData={userData} onDeleteData={() => void billingQuery.refetch()} />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
