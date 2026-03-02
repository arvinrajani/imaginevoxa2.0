'use client';

import { AlertTriangle, Globe, Heart, MessageCircle, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StudioChannel } from '@/lib/studio/types';

type ChannelPreviewProps = {
  authorName: string;
  avatarUrl?: string;
  headline?: string;
  body?: string;
  cta?: string;
  hashtags?: string[];
  imageUrl?: string | null;
};

export type PreviewWarning = {
  id: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
};

const CHANNEL_LIMITS: Record<StudioChannel, { min: number; max: number; hashtagsMin: number; hashtagsMax: number }> = {
  linkedin: { min: 150, max: 1200, hashtagsMin: 3, hashtagsMax: 5 },
  facebook: { min: 80, max: 700, hashtagsMin: 1, hashtagsMax: 4 },
  instagram: { min: 60, max: 900, hashtagsMin: 5, hashtagsMax: 12 },
};

export function buildPreviewWarnings(input: {
  channel: StudioChannel;
  fullText: string;
  hashtagCount: number;
  imageUrl?: string | null;
  hasStoryVersion?: boolean;
}): PreviewWarning[] {
  const limits = CHANNEL_LIMITS[input.channel];
  const warnings: PreviewWarning[] = [];

  if (input.fullText.length < limits.min) {
    warnings.push({
      id: 'length-short',
      severity: 'medium',
      message: `Text is short for ${input.channel}. Aim for at least ${limits.min} characters.`,
    });
  }

  if (input.fullText.length > limits.max) {
    warnings.push({
      id: 'length-long',
      severity: 'high',
      message: `Text may be truncated on ${input.channel}. Keep under ${limits.max} characters.`,
    });
  }

  if (input.hashtagCount < limits.hashtagsMin) {
    warnings.push({
      id: 'hashtags-low',
      severity: 'low',
      message: `Hashtag count is low for ${input.channel}.`,
    });
  }

  if (input.hashtagCount > limits.hashtagsMax) {
    warnings.push({
      id: 'hashtags-high',
      severity: 'medium',
      message: `Too many hashtags for ${input.channel}.`,
    });
  }

  if (input.channel === 'instagram' && !input.imageUrl) {
    warnings.push({
      id: 'image-required',
      severity: 'high',
      message: 'Instagram publishing needs an image asset.',
    });
  }

  if (input.channel === 'instagram' && !input.hasStoryVersion) {
    warnings.push({
      id: 'story-missing',
      severity: 'low',
      message: 'No story-size render detected (1080x1920).',
    });
  }

  if (input.imageUrl) {
    warnings.push({
      id: 'contrast-check',
      severity: 'low',
      message: 'Run visual QA before publishing to confirm text contrast and safe margins.',
    });
  }

  return warnings;
}

function Header({ authorName, avatarUrl }: { authorName: string; avatarUrl?: string }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="h-11 w-11 overflow-hidden rounded-full bg-slate-200">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarUrl} alt={authorName} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-gray-400">
            {authorName.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-900">{authorName}</p>
        <p className="flex items-center gap-1 text-[11px] text-gray-400">
          Just now <Globe className="h-3 w-3" />
        </p>
      </div>
    </div>
  );
}

function Content({ headline, body, cta, hashtags }: { headline?: string; body?: string; cta?: string; hashtags?: string[] }) {
  return (
    <div className="px-4 pb-3 text-[15px] leading-relaxed text-slate-900 whitespace-pre-wrap">
      {headline ? <span className="mb-2 block font-bold">{headline}</span> : null}
      {body || ''}
      {cta ? <span className="mt-3 block font-medium text-slate-700">{cta}</span> : null}
      {(hashtags || []).length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1 text-sm font-medium text-blue-600">
          {(hashtags || []).map((tag) => (
            <span key={tag}>#{tag.replace(/^#/, '')}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SharedImage({ imageUrl }: { imageUrl?: string | null }) {
  if (!imageUrl) return null;
  return (
    <div className="border-y border-slate-100 bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Post visual" className="w-full object-cover" style={{ maxHeight: 460 }} />
    </div>
  );
}

function Actions({ channel }: { channel: StudioChannel }) {
  if (channel === 'instagram') {
    return (
      <div className="flex items-center justify-between px-4 py-3 text-slate-600">
        <div className="flex items-center gap-4">
          <Heart className="h-4 w-4" />
          <MessageCircle className="h-4 w-4" />
          <Send className="h-4 w-4" />
        </div>
        <Badge className="bg-slate-100 text-slate-600">Feed Preview</Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-2 text-slate-600">
      <button className="rounded-lg px-3 py-1 text-sm hover:bg-slate-100">Like</button>
      <button className="rounded-lg px-3 py-1 text-sm hover:bg-slate-100">Comment</button>
      <button className="rounded-lg px-3 py-1 text-sm hover:bg-slate-100">{channel === 'linkedin' ? 'Repost' : 'Share'}</button>
      <button className="rounded-lg px-3 py-1 text-sm hover:bg-slate-100">Send</button>
    </div>
  );
}

export function LinkedInPreview(props: ChannelPreviewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Header authorName={props.authorName} avatarUrl={props.avatarUrl} />
      <Content headline={props.headline} body={props.body} cta={props.cta} hashtags={props.hashtags} />
      <SharedImage imageUrl={props.imageUrl} />
      <Actions channel="linkedin" />
    </div>
  );
}

export function FacebookPreview(props: ChannelPreviewProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <Header authorName={props.authorName} avatarUrl={props.avatarUrl} />
      <Content headline={props.headline} body={props.body} cta={props.cta} hashtags={props.hashtags} />
      <SharedImage imageUrl={props.imageUrl} />
      <Actions channel="facebook" />
    </div>
  );
}

export function InstagramPreview(props: ChannelPreviewProps & { storyImageUrl?: string | null }) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Header authorName={props.authorName} avatarUrl={props.avatarUrl} />
        <SharedImage imageUrl={props.imageUrl} />
        <Content headline={props.headline} body={props.body} cta={props.cta} hashtags={props.hashtags} />
        <Actions channel="instagram" />
      </div>
      {props.storyImageUrl ? (
        <div className="mx-auto w-[220px] overflow-hidden rounded-[20px] border border-slate-300 bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={props.storyImageUrl} alt="Story preview" className="h-[380px] w-full rounded-[14px] object-cover" />
          <p className="mt-2 text-center text-[11px] text-gray-600">Story Preview</p>
        </div>
      ) : null}
    </div>
  );
}

export function PreviewWarningsPanel({ warnings }: { warnings: PreviewWarning[] }) {
  if (warnings.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
        No critical warnings detected for this preview.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
      {warnings.map((warning) => (
        <div key={warning.id} className="flex items-start gap-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />
          <span>{warning.message}</span>
        </div>
      ))}
    </div>
  );
}
