'use client';

import { useRouter } from 'next/navigation';
import { TrendingUp, Image as ImageIcon, FileText, Clock, Check, Sparkles, BarChart3, Wand2, RefreshCw, Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface StudioDashboardProps {
  brandName: string;
  brandColors: string[];
  stats: {
    postsGenerated: number;
    imagesCreated: number;
    scheduledPosts: number;
    completedPosts: number;
  };
  recentActivity: Array<{
    id: string;
    type: 'post' | 'image' | 'schedule';
    title: string;
    timestamp: string;
  }>;
  stylePreferences?: string[];
  contentPillars?: string[];
  onNavigate?: (tab: string) => void;
}

export function StudioDashboard({ brandName, brandColors, stats, recentActivity, stylePreferences, contentPillars, onNavigate }: StudioDashboardProps) {
  const router = useRouter();

  const navigateTo = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      router.push(path);
    }
  };

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <Card
        className="p-8 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${brandColors[0]}20, ${brandColors[1]}20)`,
        }}
      >
        <div className="relative z-10">
          <h2 className="text-2xl font-bold mb-2">Welcome to {brandName} Studio</h2>
          <p className="text-gray-600 mb-4">
            Your AI-powered content creation hub is ready. Start generating professional LinkedIn
            posts in seconds.
          </p>
          <div className="flex gap-3">
            <Button className="bg-gradient-to-r from-cyan-500 to-blue-500" onClick={() => navigateTo('/app/generate')}>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate New Post
            </Button>
            <Button variant="outline" onClick={() => navigateTo('/app/metrics')}>
              <BarChart3 className="w-4 h-4 mr-2" />
              View Analytics
            </Button>
          </div>
        </div>
        <div
          className="absolute right-0 top-0 w-64 h-64 rounded-full opacity-10"
          style={{ background: brandColors[2], transform: 'translate(30%, -30%)' }}
        />
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${brandColors[0]}20` }}
            >
              <FileText className="w-5 h-5" style={{ color: brandColors[0] }} />
            </div>
            <Badge variant="outline" className="text-xs">
              +12% this week
            </Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{stats.postsGenerated}</div>
          <div className="text-sm text-gray-600">Posts Generated</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${brandColors[1]}20` }}
            >
              <ImageIcon className="w-5 h-5" style={{ color: brandColors[1] }} />
            </div>
            <Badge variant="outline" className="text-xs">
              +8% this week
            </Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{stats.imagesCreated}</div>
          <div className="text-sm text-gray-600">Images Created</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${brandColors[2]}20` }}
            >
              <Clock className="w-5 h-5" style={{ color: brandColors[2] }} />
            </div>
            <Badge variant="outline" className="text-xs">
              Active
            </Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{stats.scheduledPosts}</div>
          <div className="text-sm text-gray-600">Scheduled</div>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-600" />
            </div>
            <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-300">
              Published
            </Badge>
          </div>
          <div className="text-3xl font-bold mb-1">{stats.completedPosts}</div>
          <div className="text-sm text-gray-600">Completed</div>
        </Card>
      </div>

      {/* Recent Activity & Brand Profile */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Activity */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Recent Activity
          </h3>
          <div className="space-y-3">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${brandColors[0]}20` }}
                >
                  {activity.type === 'post' && <FileText className="w-4 h-4" style={{ color: brandColors[0] }} />}
                  {activity.type === 'image' && <ImageIcon className="w-4 h-4" style={{ color: brandColors[0] }} />}
                  {activity.type === 'schedule' && <Clock className="w-4 h-4" style={{ color: brandColors[0] }} />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">{activity.title}</p>
                  <p className="text-xs text-gray-500">{activity.timestamp}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Brand Profile Summary */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <ImageIcon className="w-5 h-5" />
            Brand Profile
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-gray-600 mb-2">Color Palette</p>
              <div className="flex gap-2">
                {brandColors.map((color, idx) => (
                  <div key={idx} className="flex flex-col items-center gap-1">
                    <div
                      className="w-12 h-12 rounded-lg border-2 border-white shadow"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-gray-500">{color}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-600 mb-2">Style Preferences</p>
              <div className="flex flex-wrap gap-2">
                {(stylePreferences && stylePreferences.length > 0 ? stylePreferences : ['Professional', 'Data-Driven', 'Modern']).map((pref, i) => (
                  <Badge key={i} variant="outline">{pref}</Badge>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-600 mb-2">Content Pillars</p>
              <div className="flex flex-wrap gap-2">
                {(contentPillars && contentPillars.length > 0 ? contentPillars : ['Product Updates', 'Thought Leadership', 'Industry News']).map((pillar, i) => (
                  <Badge key={i} variant="outline">{pillar}</Badge>
                ))}
              </div>
            </div>

            <Button variant="outline" size="sm" className="w-full" onClick={() => navigateTo('/app/settings')}>
              Edit Brand Profile
            </Button>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="p-6 bg-gradient-to-br from-violet-50 to-purple-50">
        <h3 className="font-semibold mb-4">Quick Actions</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <button onClick={() => navigateTo('/app/generate')} className="p-4 bg-white rounded-lg hover:shadow-md transition-shadow text-left">
            <FileText className="w-5 h-5 mb-2 text-violet-600" />
            <p className="font-medium text-sm">Generate Post</p>
            <p className="text-xs text-gray-600">Create new content</p>
          </button>
          <button onClick={() => onNavigate?.('composer')} className="p-4 bg-white rounded-lg hover:shadow-md transition-shadow text-left">
            <ImageIcon className="w-5 h-5 mb-2 text-purple-600" />
            <p className="font-medium text-sm">Create Image</p>
            <p className="text-xs text-gray-600">Design visuals</p>
          </button>
          <button onClick={() => onNavigate?.('scheduler')} className="p-4 bg-white rounded-lg hover:shadow-md transition-shadow text-left">
            <Clock className="w-5 h-5 mb-2 text-pink-600" />
            <p className="font-medium text-sm">Schedule</p>
            <p className="text-xs text-gray-600">Plan publishing</p>
          </button>
          <button onClick={() => onNavigate?.('repurpose')} className="p-4 bg-white rounded-lg hover:shadow-md transition-shadow text-left">
            <RefreshCw className="w-5 h-5 mb-2 text-cyan-600" />
            <p className="font-medium text-sm">Repurpose</p>
            <p className="text-xs text-gray-600">URL → LinkedIn post</p>
          </button>
        </div>
      </Card>
    </div>
  );
}
