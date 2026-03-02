export type StudioChannel = 'linkedin' | 'facebook' | 'instagram';

export type EvidenceType = 'pdf' | 'image' | 'url' | 'note';
export type RunStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
export type PublishStatus = 'queued' | 'sent' | 'failed';

export type EvidenceBucket = 'ads' | 'chat' | 'misc' | 'general';

export type PostVariant = {
  headline: string;
  body: string;
  cta: string;
  hashtags: string[];
  imageUrl?: string;
  imagePrompt?: string;
  variantLabel?: string;
};

export type ConfirmedPost = PostVariant & {
  channelVariants?: Partial<Record<StudioChannel, PostVariant>>;
  primaryChannel?: StudioChannel;
  selectedChannels?: StudioChannel[];
  postIntent?:
    | 'hook-focused'
    | 'story'
    | 'authority'
    | 'short-punchy'
    | 'educational'
    | string;
  altText?: string;
  firstComment?: string;
};

export type ConfirmedImageEntry = {
  url: string;
  prompt?: string;
  size?: string;
  templateId?: string;
};

export type ConfirmedImagesMap = Partial<Record<StudioChannel, ConfirmedImageEntry>>;

export type EvidenceAsset = {
  id: string;
  brand_id: string;
  owner_user_id: string;
  type: EvidenceType;
  title: string;
  description: string | null;
  bucket: string;
  tags: string[];
  file_path: string | null;
  url: string | null;
  note_text: string | null;
  created_at: string;
  signed_url?: string | null;
};

export type StudioRun = {
  id: string;
  brand_id: string;
  owner_user_id: string;
  status: RunStatus;
  approval_required: boolean;
  primary_channel: StudioChannel;
  selected_channels: StudioChannel[];
  confirmed_post: ConfirmedPost | null;
  channel_variants: Partial<Record<StudioChannel, PostVariant>> | null;
  confirmed_images: ConfirmedImagesMap | null;
  template_id: string | null;
  editor_state: Record<string, unknown> | null;
  evidence_ids: string[];
  approved_at: string | null;
  approved_by: string | null;
  approval_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StudioPublishQueueItem = {
  id: string;
  run_id: string;
  brand_id: string;
  owner_user_id: string;
  scheduled_at: string | null;
  status: PublishStatus;
  last_error: string | null;
  created_at: string;
};

export type StudioRunPatch = Partial<{
  primary_channel: StudioChannel;
  selected_channels: StudioChannel[];
  confirmed_post: ConfirmedPost | null;
  channel_variants: Partial<Record<StudioChannel, PostVariant>> | null;
  confirmed_images: ConfirmedImagesMap | null;
  template_id: string | null;
  editor_state: Record<string, unknown> | null;
  evidence_ids: string[];
  approval_notes: string | null;
}>;
