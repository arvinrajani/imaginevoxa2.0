'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  Zap,
  Image as ImageIcon,
  Video,
  RefreshCw,
  Copy,
  Check,
  Wand2,
  FileText,
  Hash,
  Clock,
  Heart,
  MessageCircle,
  Linkedin,
  AlertCircle,
  X,
  Lock,
  Crown,
  ArrowRight,
  Loader2,
  Upload,
  File,
  Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { createClient } from '@/lib/supabase/client';

const tones = [
  { id: 'professional', label: 'Professional', description: 'Business-appropriate and polished' },
  { id: 'casual', label: 'Casual', description: 'Friendly and conversational' },
  { id: 'bold', label: 'Bold', description: 'Confident and attention-grabbing' },
  { id: 'inspirational', label: 'Inspirational', description: 'Motivating and uplifting' },
  { id: 'storytelling', label: 'Storytelling', description: 'Narrative and engaging' },
];

const templates = [
  { id: 'thought-leadership', label: '💡 Thought Leadership', prompt: 'Share an industry insight or perspective' },
  { id: 'how-to', label: '📚 How-To Guide', prompt: 'Teach your audience something valuable' },
  { id: 'personal-story', label: '📖 Personal Story', prompt: 'Share a personal experience or lesson' },
  { id: 'listicle', label: '📋 Listicle', prompt: 'Share tips, tools, or resources' },
  { id: 'question', label: '❓ Engagement Question', prompt: 'Spark discussion with your audience' },
  { id: 'announcement', label: '📢 Announcement', prompt: 'Share news or updates' },
];

// Plan configurations
const PLAN_LIMITS = {
  starter: { credits: 25, name: 'Starter', canPostToLinkedIn: false },
  pro: { credits: 30, name: 'Pro', canPostToLinkedIn: true },
  business: { credits: 60, name: 'Pro+', canPostToLinkedIn: true }
};

type UserPlan = 'starter' | 'pro' | 'business';
type ContentSource = 'text' | 'pdf' | 'image' | 'video';
type LinkedInOrg = { id: string; name: string; urn: string };
type LinkedInConnection = {
  member_urn?: string | null;
  linkedin_member_urn?: string | null;
  orgs?: LinkedInOrg[];
  org_access_token?: string | null;
};

const LENGTH_OPTIONS: Array<{ id: 'short' | 'standard' | 'long'; label: string; hint: string }> = [
  { id: 'short', label: 'Short', hint: '600-900 characters' },
  { id: 'standard', label: 'Standard', hint: '900-1400 characters' },
  { id: 'long', label: 'Long', hint: '1400-2200 characters' },
];

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'has',
  'have', 'if', 'in', 'into', 'is', 'it', 'its', 'of', 'on', 'or', 'our', 'that',
  'the', 'their', 'there', 'they', 'this', 'to', 'was', 'we', 'were', 'what',
  'when', 'where', 'who', 'why', 'with', 'you', 'your'
]);

const extractHashtags = (content: string) => {
  const matches = content.match(/#[A-Za-z0-9_]+/g) || [];
  return matches.map(tag => tag.trim());
};

const getPrimaryLine = (content: string) => {
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return '';
  const firstLine = lines[0];
  if (firstLine.length <= 140) return firstLine;
  const sentence = firstLine.split(/[.!?]/).map(part => part.trim()).filter(Boolean)[0];
  return sentence || firstLine;
};

const buildHookSuggestions = (content: string) => {
  const base = getPrimaryLine(content);
  if (!base) return [];
  const hooks = [
    base,
    `Quick takeaway: ${base}`,
    `What I learned: ${base}`,
    `One thing that surprised me: ${base}`,
  ];
  return Array.from(new Set(hooks)).slice(0, 4);
};

const replaceFirstLine = (content: string, newLine: string) => {
  const lines = content.split(/\r?\n/);
  const index = lines.findIndex(line => line.trim().length > 0);
  if (index === -1) return newLine;
  lines[index] = newLine;
  return lines.join('\n');
};

const buildHashtagSuggestions = (content: string, limit = 6) => {
  const words = content.toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const counts: Record<string, number> = {};
  words.forEach(word => {
    if (STOP_WORDS.has(word)) return;
    counts[word] = (counts[word] || 0) + 1;
  });

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => `#${word[0].toUpperCase()}${word.slice(1)}`)
    .filter(tag => !extractHashtags(content).includes(tag))
    .slice(0, limit);
};

const mergeHashtags = (content: string, hashtags: string[]) => {
  if (hashtags.length === 0) return content;
  const existing = new Set(extractHashtags(content));
  const filtered = hashtags.filter(tag => !existing.has(tag));
  if (filtered.length === 0) return content;
  const separator = content.trim().length === 0 ? '' : '\n\n';
  return `${content}${separator}${filtered.join(' ')}`.trim();
};

const getPostMetrics = (content: string) => {
  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
  const chars = content.length;
  const readingTime = words === 0 ? 0 : Math.max(1, Math.ceil(words / 200));
  const hasQuestion = /\?/.test(content);
  const hasHashtags = /#[A-Za-z0-9_]+/.test(content);
  const hasEmoji = /[\uD83C-\uDBFF\uDC00-\uDFFF]/.test(content);
  const hasLink = /(https?:\/\/|www\.)/i.test(content);
  const hasCta = /(comment|share|thoughts|let me know|what do you think|dm|reach out|follow)/i.test(content);
  const lengthStatus = chars < 300 ? 'Short' : chars > 1300 ? 'Long' : 'Good';

  return {
    words,
    chars,
    readingTime,
    hasQuestion,
    hasHashtags,
    hasEmoji,
    hasLink,
    hasCta,
    lengthStatus,
  };
};

export default function GeneratePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  
  // Content source
  const [contentSource, setContentSource] = useState<ContentSource>('text');
  
  // Text input
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('professional');
  const [template, setTemplate] = useState<string | null>(null);
  const [includeHashtags, setIncludeHashtags] = useState(false);
  const [targetAudience, setTargetAudience] = useState('');
  const [postGoal, setPostGoal] = useState('');
  const [lengthPreference, setLengthPreference] = useState<'short' | 'standard' | 'long'>('standard');
  
  // PDF upload
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState('');
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);
  
  // Image upload
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [imagePreviewUrls, setImagePreviewUrls] = useState<string[]>([]);
  const [imagePrompt, setImagePrompt] = useState('');

  // Video upload
  const [uploadedVideo, setUploadedVideo] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string>('');
  const [videoPrompt, setVideoPrompt] = useState('');
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPost, setGeneratedPost] = useState<{
    content: string;
    imageUrl?: string;
    imageUrls?: string[];
    videoUrl?: string;
    hashtags?: string[];
    postId?: string;
  } | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [selectedHashtags, setSelectedHashtags] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  
  // User data
  const [loading, setLoading] = useState(true);
  const [userPlan, setUserPlan] = useState<UserPlan>('starter');
  const [creditsRemaining, setCreditsRemaining] = useState(25);
  const [creditsTotal, setCreditsTotal] = useState(25);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [orgAppConnected, setOrgAppConnected] = useState(false);
  const [userName, setUserName] = useState('');
  
  // Posting target (person or organization)
  const [postingTarget, setPostingTarget] = useState<'person' | 'organization'>('person');
  const [organizations, setOrganizations] = useState<Array<{ id: string; name: string; urn: string }>>([]);
  const [selectedOrgUrn, setSelectedOrgUrn] = useState<string>('');
  const [memberUrn, setMemberUrn] = useState<string>('');

  const readImageAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  useEffect(() => {
    async function fetchUserData() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileRows } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1);
      const profile = profileRows?.[0] ?? null;

      setUserName(profile?.full_name || user.email?.split('@')[0] || 'User');
      
      // Get user plan from database
      const userPlanFromDb: UserPlan = 'pro';
      const effectivePlan: UserPlan = userPlanFromDb;

      const { data: linkedinRows } = await supabase
        .from('linkedin_connections')
        .select('*')
        .eq('user_id', user.id)
        .limit(1);
      const linkedinConn = (linkedinRows?.[0] as LinkedInConnection | null) ?? null;

      setLinkedinConnected(!!linkedinConn);
      setOrgAppConnected(!!linkedinConn?.org_access_token);
      
      // Set member URN and organizations
      if (linkedinConn) {
        const memberUrnValue = linkedinConn.member_urn || linkedinConn.linkedin_member_urn || '';
        setMemberUrn(memberUrnValue);
        const orgsData = linkedinConn.orgs || [];
        setOrganizations(orgsData);
        if (orgsData.length > 0) {
          setSelectedOrgUrn(orgsData[0].urn);
        }
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      
      const { data: posts } = await supabase
        .from('posts')
        .select('id')
        .eq('user_id', user.id)
        .gte('created_at', startOfMonth.toISOString());

      const postsThisMonth = posts?.length || 0;
      const total = PLAN_LIMITS[effectivePlan].credits;
      
      setUserPlan(effectivePlan);
      setCreditsTotal(total);
      setCreditsRemaining(Math.max(0, total - postsThisMonth));
      setLoading(false);
    }

    fetchUserData();
  }, []);

  const canPostToLinkedIn = PLAN_LIMITS[userPlan].canPostToLinkedIn;
  const canGenerateImages = userPlan !== 'starter';
  const hookSuggestions = useMemo(() => buildHookSuggestions(draftContent), [draftContent]);
  const hashtagSuggestions = useMemo(() => buildHashtagSuggestions(draftContent), [draftContent]);
  const lengthHint = useMemo(
    () => LENGTH_OPTIONS.find((option) => option.id === lengthPreference)?.hint || '',
    [lengthPreference]
  );
  const previewContent = useMemo(() => {
    if (!includeHashtags) return draftContent;
    const tagsToUse = selectedHashtags.length > 0 ? selectedHashtags : hashtagSuggestions;
    return mergeHashtags(draftContent, tagsToUse);
  }, [draftContent, includeHashtags, selectedHashtags, hashtagSuggestions]);
  const postMetrics = useMemo(() => getPostMetrics(previewContent), [previewContent]);

  // Handle PDF file selection
  const handlePdfSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      setPublishError('Please select a valid PDF file');
      return;
    }
    
    setPdfFile(file);
    setPdfText('');
    setIsExtractingPdf(true);
    setPublishError(null);
    
    try {
      // Send PDF to API for text extraction
      const formData = new FormData();
      formData.append('pdf', file);
      
      const response = await fetch('/api/extract-pdf', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Failed to extract PDF text');
      }
      
      const data = await response.json();
      setPdfText(data.text || '');
    } catch (error) {
      console.error('PDF extraction error:', error);
      setPublishError('Failed to extract text from PDF. Please try again.');
      setPdfFile(null);
    } finally {
      setIsExtractingPdf(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle image file selection
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validImages = files.filter(file => file.type.startsWith('image/'));
    
    if (validImages.length === 0) {
      setPublishError('Please select valid image files');
      return;
    }
    
    // Limit to 4 images
    const newImages = validImages.slice(0, 4);
    setUploadedImages(newImages);
    
    try {
      const newPreviews = await Promise.all(newImages.map(readImageAsDataUrl));
      setImagePreviewUrls(newPreviews);
      setPublishError(null);
      if (contentSource === 'image') {
        setGeneratedPost(prev => prev ? { ...prev, imageUrls: newPreviews, imageUrl: newPreviews[0] } : prev);
      }
    } catch (error) {
      console.error('Image read error:', error);
      setPublishError('Failed to read images. Please try again.');
    } finally {
      if (imageInputRef.current) {
        imageInputRef.current.value = '';
      }
    }
  };

  // Remove an image
  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviewUrls(prev => {
      const next = prev.filter((_, i) => i !== index);
      if (contentSource === 'image') {
        setGeneratedPost(post => post ? { ...post, imageUrls: next, imageUrl: next[0] } : post);
      }
      return next;
    });
  };

  const clearImages = () => {
    setUploadedImages([]);
    setImagePreviewUrls([]);
    if (imageInputRef.current) {
      imageInputRef.current.value = '';
    }
    if (contentSource === 'image') {
      setGeneratedPost(post => post ? { ...post, imageUrls: [], imageUrl: undefined } : post);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('video/')) {
      setPublishError('Please select a valid video file');
      return;
    }

    setUploadedVideo(file);
    setPublishError(null);

    const previewUrl = URL.createObjectURL(file);
    setVideoPreviewUrl(prev => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return previewUrl;
    });

    if (contentSource === 'video') {
      setGeneratedPost(prev => prev ? { ...prev, videoUrl: previewUrl } : prev);
    }

    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  const clearVideo = () => {
    setUploadedVideo(null);
    setVideoPrompt('');
    setVideoPreviewUrl(prev => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return '';
    });

    if (contentSource === 'video') {
      setGeneratedPost(post => post ? { ...post, videoUrl: undefined } : post);
    }

    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  // Clear PDF
  const clearPdf = () => {
    setPdfFile(null);
    setPdfText('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerate = async () => {
    // Validate based on content source
    if (contentSource === 'text' && !topic.trim()) {
      setPublishError('Please enter a topic');
      return;
    }
    if (contentSource === 'pdf' && !pdfText) {
      setPublishError('Please upload a PDF first');
      return;
    }
    if (contentSource === 'image' && uploadedImages.length === 0) {
      setPublishError('Please upload at least one image');
      return;
    }
    if (contentSource === 'video' && !uploadedVideo) {
      setPublishError('Please upload a video');
      return;
    }
    if (contentSource === 'image' && !imagePrompt.trim()) {
      setPublishError('Please describe what you want to say about your images');
      return;
    }
    if (contentSource === 'video' && !videoPrompt.trim()) {
      setPublishError('Please describe what you want to say about your video');
      return;
    }
    
    // For PDF: require manual description if text extraction failed
    if (contentSource === 'pdf' && (pdfText.includes('Could not extract') || pdfText.includes('image-based')) && !topic.trim()) {
      setPublishError('Please describe the PDF content since text extraction failed');
      return;
    }
    
    if (creditsRemaining <= 0) {
      setPublishError('You have no credits remaining. Please upgrade your plan.');
      return;
    }

    const guidanceParts: string[] = [];
    if (targetAudience.trim()) {
      guidanceParts.push(`Target audience: ${targetAudience.trim()}.`);
    }
    if (postGoal.trim()) {
      guidanceParts.push(`Goal or call-to-action: ${postGoal.trim()}.`);
    }
    if (lengthPreference === 'short') {
      guidanceParts.push('Length: keep it concise (about 600 to 900 characters).');
    } else if (lengthPreference === 'long') {
      guidanceParts.push('Length: allow more detail (about 1400 to 2200 characters).');
    } else {
      guidanceParts.push('Length: standard (about 900 to 1400 characters).');
    }
    const guidanceNote = guidanceParts.length > 0 ? `\n\nAdditional guidance: ${guidanceParts.join(' ')}` : '';
    
    setIsGenerating(true);
    setPublishError(null);
    
    try {
      const formData = new FormData();
      formData.append('tone', tone);
      formData.append('contentSource', contentSource);
      
      if (contentSource === 'text') {
        formData.append('prompt', `${topic}${guidanceNote}`);
        formData.append('wantImage', canGenerateImages ? 'true' : 'false');
      } else if (contentSource === 'pdf') {
        // Check if we have extracted text or need to use manual description
        const hasExtractedText = pdfText && !pdfText.includes('Could not extract') && !pdfText.includes('image-based');
        const pdfContent = hasExtractedText 
          ? pdfText.substring(0, 3000)
          : topic; // Use manual description
        
        const additionalContext = hasExtractedText && topic.trim() 
          ? `\n\nAdditional context from user: ${topic}` 
          : '';
        
        formData.append('prompt', `Create a LinkedIn post based on this document content:\n\n${pdfContent}${additionalContext}${guidanceNote}`);
        formData.append('pdfText', pdfContent);
        formData.append('wantImage', canGenerateImages ? 'true' : 'false');
      } else if (contentSource === 'image') {
        formData.append('prompt', `Create a LinkedIn post about these personal images. Context from user: ${imagePrompt}${guidanceNote}`);
        formData.append('imageContext', imagePrompt);
        formData.append('wantImage', 'false'); // User has their own images
        // Attach images
        uploadedImages.forEach((img, i) => {
          formData.append(`image_${i}`, img);
        });
      } else if (contentSource === 'video') {
        formData.append('prompt', `Create a LinkedIn post about this personal video. Context from user: ${videoPrompt}${guidanceNote}`);
        formData.append('videoContext', videoPrompt);
        formData.append('wantImage', 'false');
      }
      
      formData.append('approvalRequired', 'false');

      const response = await fetch('/api/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }

      const data = await response.json();
      
      console.log('Generate API response:', data); // Debug log
      
      const postId = data.postId || data.id;
      console.log('Post ID extracted:', postId); // Debug log
      
      if (!postId) {
        console.error('No post ID in response!', data);
        throw new Error('Failed to save post - no ID returned');
      }
      
      const imageUrls = contentSource === 'image'
        ? imagePreviewUrls
        : (data.imageUrl || data.image_url ? [data.imageUrl || data.image_url] : []);

      const generatedContent = data.content || data.post_content;

      setGeneratedPost({
        content: generatedContent,
        imageUrl: imageUrls[0],
        imageUrls: imageUrls.length ? imageUrls : undefined,
        videoUrl: contentSource === 'video' ? videoPreviewUrl : undefined,
        postId: postId,
      });
      setDraftContent(generatedContent);
      setSelectedHashtags([]);
      
      setCreditsRemaining(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Generation error:', error);
      setPublishError(error instanceof Error ? error.message : 'Generation failed. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedPost) return;
    navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePublish = async () => {
    if (!generatedPost || !canPostToLinkedIn) return;
    
    if (!linkedinConnected) {
      setPublishError('Please connect your LinkedIn account first');
      return;
    }
    
    console.log('Publishing with postId:', generatedPost.postId); // Debug log
    console.log('Target type:', postingTarget);
    console.log('Selected org URN:', selectedOrgUrn);
    console.log('Member URN:', memberUrn);
    console.log('Final targetUrn:', postingTarget === 'organization' ? selectedOrgUrn : memberUrn);
    
    if (!generatedPost.postId) {
      setPublishError('No post ID - please regenerate the post');
      return;
    }
    
    setIsPublishing(true);
    setPublishError(null);
    
    try {
      const publishImageUrls = contentSource === 'image'
        ? (imagePreviewUrls.length
          ? imagePreviewUrls
          : (generatedPost.imageUrls || (generatedPost.imageUrl ? [generatedPost.imageUrl] : [])))
        : (generatedPost.imageUrls || (generatedPost.imageUrl ? [generatedPost.imageUrl] : []));

      const targetUrn = postingTarget === 'organization' ? selectedOrgUrn : memberUrn;

      const response = uploadedVideo && contentSource === 'video'
        ? await fetch('/api/approve', {
            method: 'POST',
            body: (() => {
              const formData = new FormData();
              formData.append('postId', generatedPost.postId || '');
              formData.append('content', previewContent);
              formData.append('targetType', postingTarget);
              formData.append('targetUrn', targetUrn);
              formData.append('video', uploadedVideo);
              return formData;
            })(),
          })
        : await fetch('/api/approve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              postId: generatedPost.postId,
              content: previewContent,
              imageUrl: publishImageUrls[0],
              imageUrls: publishImageUrls,
              targetType: postingTarget,
              targetUrn: targetUrn,
            }),
          });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to publish');
      }

      router.push('/app/posts?published=true');
    } catch (error) {
      setPublishError(error instanceof Error ? error.message : 'Failed to publish');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleRegenerate = () => {
    setGeneratedPost(null);
    setDraftContent('');
    setSelectedHashtags([]);
    handleGenerate();
  };

  const resetDraft = () => {
    if (!generatedPost) return;
    setDraftContent(generatedPost.content);
    setSelectedHashtags([]);
  };

  const toggleHashtag = (tag: string) => {
    setSelectedHashtags(prev =>
      prev.includes(tag) ? prev.filter(item => item !== tag) : [...prev, tag]
    );
  };

  const applyHashtags = () => {
    const tagsToApply = selectedHashtags.length > 0 ? selectedHashtags : hashtagSuggestions;
    if (tagsToApply.length === 0) return;
    setDraftContent(prev => mergeHashtags(prev, tagsToApply));
    setSelectedHashtags([]);
  };

  const renderImageLayout = (urls: string[]) => {
    if (urls.length === 0) return null;

    if (urls.length === 1) {
      return (
        <div className="mt-4 -mx-4">
          <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <img
              src={urls[0]}
              alt="Post image"
              className="h-full w-full object-cover"
            />
          </div>
        </div>
      );
    }

    const gridClass = urls.length === 2
      ? "grid grid-cols-2 gap-1"
      : "grid grid-cols-2 grid-rows-2 gap-1";

    return (
      <div className="mt-4 -mx-4">
        <div className={`${gridClass} aspect-[4/3] bg-gray-100 dark:bg-gray-800 overflow-hidden`}>
          {urls.slice(0, 4).map((url, index) => (
            <div
              key={`${url}-${index}`}
              className={urls.length === 3 && index === 0 ? "row-span-2" : ""}
            >
              <img
                src={url}
                alt={`Post image ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderVideoLayout = (url?: string) => {
    if (!url) return null;
    return (
      <div className="mt-4 -mx-4">
        <div className="aspect-video bg-black">
          <video
            src={url}
            controls
            className="h-full w-full object-contain"
          />
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
      </div>
    );
  }

  // Show upgrade prompt if no credits
  if (creditsRemaining <= 0 && !generatedPost) {
    return (
      <div className="max-w-2xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center p-12 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 rounded-3xl border border-violet-200 dark:border-violet-800"
        >
          <div className="h-20 w-20 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mx-auto mb-6">
            <Zap className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            You have used all your credits!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
            You have created {creditsTotal} posts this month on the {PLAN_LIMITS[userPlan].name} plan.
            Upgrade to Pro or Pro+ for more posts and direct LinkedIn publishing.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/pricing">
              <Button className="bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white px-8">
                <Crown className="h-5 w-5 mr-2" />
                See Plans
              </Button>
            </Link>
            <Link href="/app/posts">
              <Button variant="outline">
                View Your Posts
              </Button>
            </Link>
          </div>
          <p className="text-sm text-gray-500 mt-6">
            Credits reset at the start of each month
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        eyebrow="Generate"
        className="mb-8"
        title={
          <>
            <span className="text-voxa-gradient">Generate</span> Post
          </>
        }
        subtitle="Create engaging LinkedIn content with AI"
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border-2 border-violet-200 dark:border-violet-800 bg-gradient-to-br from-violet-50 to-white dark:from-violet-900/20 dark:to-gray-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-violet-600 text-white flex items-center justify-center text-xs font-bold">1</div>
            <p className="text-sm font-bold text-violet-900 dark:text-violet-100">Choose Your Content</p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Start with text ideas, upload a PDF, add photos, or share a video</p>
        </div>
        <div className="rounded-xl border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/20 dark:to-gray-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</div>
            <p className="text-sm font-bold text-blue-900 dark:text-blue-100">Set Tone & Goals</p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Tell us who you're talking to and what tone to use</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-900/20 dark:to-gray-900 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">3</div>
            <p className="text-sm font-bold text-emerald-900 dark:text-emerald-100">Review & Share</p>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Edit the AI draft, then publish directly or copy to LinkedIn</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left: Input Form */}
        <div className="space-y-6">
          {/* Credits Banner */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center justify-between p-4 rounded-xl border ${
              creditsRemaining <= 1 
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                : 'bg-gradient-to-r from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 border-violet-200 dark:border-violet-800'
            }`}
          >
            <div className="flex items-center gap-3">
              <Zap className={`h-5 w-5 ${creditsRemaining <= 1 ? 'text-amber-600' : 'text-violet-600 dark:text-violet-400'}`} />
              <span className={`text-sm font-medium ${creditsRemaining <= 1 ? 'text-amber-900 dark:text-amber-100' : 'text-violet-900 dark:text-violet-100'}`}>
                {creditsRemaining} / {creditsTotal} credits remaining
              </span>
            </div>
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="text-violet-600 dark:text-violet-400">
                {creditsRemaining <= 1 ? 'Upgrade Now' : 'Get More'}
              </Button>
            </Link>
          </motion.div>

          {/* Starter Plan Notice */}
          {userPlan === 'starter' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    Starter Plan - Manual Publishing
                  </p>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                    Upload PDFs, images, and videos, then copy your post to LinkedIn.
                    <Link href="/pricing" className="underline ml-1 font-medium">
                      See Plans
                    </Link> for Voxa image generation and direct publishing.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Content Source Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Content Source
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => setContentSource('text')}
                className={`p-4 rounded-xl text-center transition-all ${
                  contentSource === 'text'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <FileText className="h-6 w-6 mx-auto mb-2" />
                <p className="font-medium text-sm">Text</p>
                <p className={`text-xs mt-0.5 ${contentSource === 'text' ? 'text-violet-200' : 'text-gray-500'}`}>
                  Write a prompt
                </p>
              </button>
              <button
                onClick={() => setContentSource('pdf')}
                className={`p-4 rounded-xl text-center transition-all ${
                  contentSource === 'pdf'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <File className="h-6 w-6 mx-auto mb-2" />
                <p className="font-medium text-sm">PDF</p>
                <p className={`text-xs mt-0.5 ${contentSource === 'pdf' ? 'text-violet-200' : 'text-gray-500'}`}>
                  Upload document
                </p>
              </button>
              <button
                onClick={() => setContentSource('image')}
                className={`p-4 rounded-xl text-center transition-all ${
                  contentSource === 'image'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <ImageIcon className="h-6 w-6 mx-auto mb-2" />
                <p className="font-medium text-sm">Image</p>
                <p className={`text-xs mt-0.5 ${contentSource === 'image' ? 'text-violet-200' : 'text-gray-500'}`}>
                  Your photos
                </p>
              </button>
              <button
                onClick={() => setContentSource('video')}
                className={`p-4 rounded-xl text-center transition-all ${
                  contentSource === 'video'
                    ? 'bg-violet-600 text-white'
                    : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <Video className="h-6 w-6 mx-auto mb-2" />
                <p className="font-medium text-sm">Video</p>
                <p className={`text-xs mt-0.5 ${contentSource === 'video' ? 'text-violet-200' : 'text-gray-500'}`}>
                  Your video
                </p>
              </button>
            </div>
            
            {/* Pro Features Upgrade Banner for Starter */}
            {userPlan === 'starter' && (
              <div className="mt-3 p-3 bg-gradient-to-r from-violet-50 to-blue-50 dark:from-violet-900/20 dark:to-blue-900/20 border border-violet-200 dark:border-violet-800 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 text-violet-600" />
                    <span className="text-sm text-violet-900 dark:text-violet-100">
                      Unlock Voxa image generation and direct publishing with Pro or Pro+
                    </span>
                  </div>
                  <Link href="/pricing">
                    <Button size="sm" variant="ghost" className="text-violet-600 dark:text-violet-400 h-7 text-xs">
                      Upgrade <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* TEXT SOURCE */}
          {contentSource === 'text' && (
            <>
              {/* Topic Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What would you like to post about? *
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Type your topic or idea here...\n\nExamples:\n• Share 3 lessons I learned from failing at my first startup\n• Explain why AI won't replace developers, but will change how we work\n• Announce our company's new sustainability initiative\n• Tell the story of how I landed my dream job\n• Give 5 actionable tips for better LinkedIn engagement\n\nThe more detail you provide, the better your AI-generated post will be!"
                  rows={4}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-start gap-1">
                  <Sparkles className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>Tip: Be specific! Instead of "productivity tips", try "5 time management techniques that helped me finish work by 3pm"</span>
                </p>
              </div>

              {/* Quick Templates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Quick Template (optional)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setTemplate(template === t.id ? null : t.id);
                        if (!topic) setTopic(t.prompt);
                      }}
                      className={`p-3 rounded-xl text-left text-sm transition-all ${
                        template === t.id
                          ? 'bg-violet-100 dark:bg-violet-900/50 border-2 border-violet-500'
                          : 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* PDF SOURCE */}
          {contentSource === 'pdf' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Upload PDF Document
                </label>
                
                {!pdfFile ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
                  >
                    <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Click to upload PDF
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      We will extract the text and create a post
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Files are processed for extraction and not stored.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={handlePdfSelect}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <File className="h-8 w-8 text-red-500" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-sm">
                            {pdfFile.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(pdfFile.size / 1024).toFixed(1)} KB
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={clearPdf}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    
                    {isExtractingPdf ? (
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting text...
                      </div>
                    ) : pdfText ? (
                      <div>
                        {pdfText.includes('Could not extract') || pdfText.includes('image-based') ? (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
                            ⚠️ This PDF is image-based. Please describe the content below.
                          </p>
                        ) : (
                          <>
                            <p className="text-xs text-green-600 dark:text-green-400 mb-2">
                              ✓ Text extracted successfully
                            </p>
                            <div className="max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-900 p-3 rounded-lg">
                              {pdfText.substring(0, 500)}...
                            </div>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
              
              {/* Manual description for image-based PDFs or additional context */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Describe the PDF content {pdfText && !pdfText.includes('Could not extract') ? '(optional)' : '*'}
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={pdfText && !pdfText.includes('Could not extract') 
                    ? "Add context or angle for the post...\n\nExamples:\n• Highlight the 3 most important insights from this report\n• Focus on the cost-saving benefits mentioned in the document\n• Create a post that asks for feedback on these findings"
                    : "Describe the main points from your PDF...\n\nExamples:\n• This product catalog covers our new smart capacitors with energy-saving features\n• Whitepaper about AI trends in 2026, focusing on practical business applications\n• Case study showing how our client increased sales by 40% in 6 months"}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                  {pdfText && !pdfText.includes('Could not extract') 
                    ? '✓ We extracted the text - add any extra context or focus areas here'
                    : '⚠️ Couldn\'t extract text automatically - please summarize the key points from your PDF'}
                </p>
              </div>
            </div>
          )}

          {/* IMAGE SOURCE */}
          {contentSource === 'image' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Upload Your Images (up to 4)
                  </label>
                  {imagePreviewUrls.length > 0 && (
                    <button
                      type="button"
                      onClick={clearImages}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  {/* Image Previews */}
                  {imagePreviewUrls.map((url, index) => (
                    <div key={index} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <img src={url} alt={`Upload ${index + 1}`} className="w-full h-full object-cover" />
                      <button
                        onClick={() => removeImage(index)}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Add More Button */}
                  {uploadedImages.length < 4 && (
                    <div
                      onClick={() => imageInputRef.current?.click()}
                      className="aspect-square border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
                    >
                      <Upload className="h-8 w-8 text-gray-400 mb-2" />
                      <p className="text-xs text-gray-500">Select Images</p>
                      <input
                        ref={imageInputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageSelect}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  Images stay in your browser until you publish.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What is this post about? *
                </label>
                <textarea
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  placeholder="Tell us what story these images tell...\n\nExamples:\n• Just wrapped our best team offsite yet! These moments show what makes our culture special\n• Proud to unveil our new product. Here's what 6 months of work looks like\n• Behind the scenes of how we solve customer problems every day\n• Last week at the conference - met incredible people and learned so much"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-start gap-1">
                  <ImageIcon className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>AI will create engaging text to complement your images - be descriptive about what they show and why they matter</span>
                </p>
              </div>
            </>
          )}

          {/* VIDEO SOURCE */}
          {contentSource === 'video' && (
            <>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Upload Your Video
                  </label>
                  {uploadedVideo && (
                    <button
                      type="button"
                      onClick={clearVideo}
                      className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {!uploadedVideo ? (
                  <div
                    onClick={() => videoInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center cursor-pointer hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
                  >
                    <Upload className="h-10 w-10 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Click to upload video
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      MP4, MOV, or WebM
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Videos stay in your browser until you publish.
                    </p>
                    <input
                      ref={videoInputRef}
                      type="file"
                      accept="video/*"
                      onChange={handleVideoSelect}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="aspect-video bg-black">
                      <video
                        src={videoPreviewUrl}
                        controls
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="p-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {uploadedVideo.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(uploadedVideo.size / (1024 * 1024)).toFixed(1)} MB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={clearVideo}
                        className="p-2 text-gray-500 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What is this post about? *
                </label>
                <textarea
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                  placeholder="Describe your video content...\n\nExamples:\n• Quick demo of our new feature that saves users 2 hours a week\n• Recap of last week's industry event with key takeaways\n• Behind-the-scenes look at how we build our products\n• Customer testimonial showing real results from our solution"
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none transition-all"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 flex items-start gap-1">
                  <Video className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>We'll write a compelling caption that drives engagement with your video content</span>
                </p>
              </div>
            </>
          )}

          {/* Tone Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tone
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {tones.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`p-3 rounded-xl text-left transition-all ${
                    tone === t.id
                      ? 'bg-violet-600 text-white'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <p className="font-medium text-sm">{t.label}</p>
                  <p className={`text-xs mt-0.5 ${tone === t.id ? 'text-violet-200' : 'text-gray-500'}`}>
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Audience & Goal */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Audience and Goal (Optional but Recommended)
            </label>
            <div className="space-y-3">
              <div>
                <input
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="Who are you writing for? (e.g., Marketing managers, Tech entrepreneurs, Job seekers)"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">This helps the AI write in a way that resonates with your readers</p>
              </div>
              <div>
                <input
                  value={postGoal}
                  onChange={(e) => setPostGoal(e.target.value)}
                  placeholder="What do you want readers to do? (e.g., Visit our website, Comment their thoughts, Book a call)"
                  className="w-full h-11 px-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">We'll create a compelling call-to-action based on your goal</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                  Length preference
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {LENGTH_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setLengthPreference(option.id)}
                      className={`p-3 rounded-xl text-center transition-all border ${
                        lengthPreference === option.id
                          ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-200'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-violet-300 dark:hover:border-violet-700'
                      }`}
                    >
                      <p className="text-sm font-medium">{option.label}</p>
                      <p className="text-[11px] mt-1 text-gray-500">{option.hint}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Posting Target Selector - Only for Pro/Business users with LinkedIn connected */}
          {canPostToLinkedIn && linkedinConnected && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Post As
              </label>
              <div className="space-y-3">
                {/* Person or Organization Toggle */}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPostingTarget('person')}
                    className={`p-4 rounded-xl text-center transition-all flex items-center justify-center gap-2 ${
                      postingTarget === 'person'
                        ? 'bg-violet-600 text-white'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
                      {userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-sm">Personal</p>
                      <p className={`text-xs ${postingTarget === 'person' ? 'text-violet-200' : 'text-gray-500'}`}>
                        {userName}
                      </p>
                    </div>
                  </button>
                  
                  <button
                    onClick={() => (orgAppConnected && organizations.length > 0) ? setPostingTarget('organization') : null}
                    className={`p-4 rounded-xl text-center transition-all flex items-center justify-center gap-2 ${
                      postingTarget === 'organization'
                        ? 'bg-violet-600 text-white'
                        : (!orgAppConnected || organizations.length === 0)
                        ? 'bg-gray-100 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                      <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 7V3H2v18h20V7H12zM6 19H4v-2h2v2zm0-4H4v-2h2v2zm0-4H4V9h2v2zm0-4H4V5h2v2zm4 12H8v-2h2v2zm0-4H8v-2h2v2zm0-4H8V9h2v2zm0-4H8V5h2v2zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10zm-2-8h-2v2h2v-2zm0 4h-2v2h2v-2z" />
                      </svg>
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-sm">Organization</p>
                      <p className={`text-xs ${postingTarget === 'organization' ? 'text-violet-200' : 'text-gray-500'}`}>
                        {!orgAppConnected ? 'Org app not connected' : organizations.length === 0 ? 'No pages found' : 'Company page'}
                      </p>
                    </div>
                  </button>
                </div>
                
                {/* Organization Dropdown - only show when organization is selected and there are orgs */}
                {postingTarget === 'organization' && orgAppConnected && organizations.length > 0 && (
                  <>
                    <select
                      value={selectedOrgUrn}
                      onChange={(e) => setSelectedOrgUrn(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent transition-all text-sm"
                    >
                      {organizations.map((org) => (
                        <option key={org.urn} value={org.urn}>
                          {org.name}
                        </option>
                      ))}
                    </select>
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-300">
                        ⚠️ <strong>Note:</strong> Posting as organization requires LinkedIn Marketing Developer Platform approval. 
                        If posting fails, try posting as your personal profile instead.
                      </p>
                    </div>
                  </>
                )}
                
                {!orgAppConnected && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Connect the organization LinkedIn app to enable company posting.
                    <Link href="/app/linkedin" className="text-violet-600 dark:text-violet-400 ml-1 hover:underline">
                      Connect now
                    </Link>
                  </p>
                )}

                {orgAppConnected && organizations.length === 0 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    ?? To post as an organization, you need to be an admin of a LinkedIn Company Page. 
                    <a href="https://www.linkedin.com/company/setup/new/" target="_blank" rel="noopener noreferrer" className="text-violet-600 dark:text-violet-400 ml-1 hover:underline">
                      Create a page
                    </a>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error Message */}
          <AnimatePresence>
            {publishError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3"
              >
                <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-600 dark:text-red-400">{publishError}</p>
                </div>
                <button onClick={() => setPublishError(null)} className="ml-auto">
                  <X className="h-4 w-4 text-red-400" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || creditsRemaining <= 0}
            className="w-full h-14 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white font-semibold text-lg shadow-lg shadow-violet-500/25"
          >
            {isGenerating ? (
              <motion.div
                className="flex items-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <RefreshCw className="h-5 w-5 animate-spin" />
                <span>Generating...</span>
              </motion.div>
            ) : (
              <>
                <Wand2 className="h-5 w-5 mr-2" />
                Generate Post
              </>
            )}
          </Button>
        </div>

        {/* Right: Preview */}
        <div>
          <div className="sticky top-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Preview
            </h2>
            
            <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {generatedPost ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {/* LinkedIn-style header */}
                  <div className="p-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center text-white font-bold">
                        {userName.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-white">{userName}</p>
                        <p className="text-xs text-gray-500">Just now • 🌐</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Post content */}
                  <div className="p-4">
                    <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm leading-relaxed">
                      {previewContent}
                    </p>
                    
                    {/* Media */}
                    {generatedPost.videoUrl
                      ? renderVideoLayout(generatedPost.videoUrl)
                      : renderImageLayout(
                          generatedPost.imageUrls?.length
                            ? generatedPost.imageUrls
                            : (generatedPost.imageUrl ? [generatedPost.imageUrl] : [])
                        )}
                  </div>
                  
                  {/* Engagement bar */}
                  <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-6 text-gray-500">
                    <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                      <Heart className="h-5 w-5" />
                      <span className="text-sm">Like</span>
                    </button>
                    <button className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                      <MessageCircle className="h-5 w-5" />
                      <span className="text-sm">Comment</span>
                    </button>
                  </div>
                  
                  {/* Action buttons */}
                  <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700 space-y-3">
                    <div className="flex gap-3">
                      <Button
                        onClick={handleCopy}
                        variant="outline"
                        className="flex-1"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 mr-2 text-green-500" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Copy to Clipboard
                          </>
                        )}
                      </Button>
                      
                      {canPostToLinkedIn && (
                        <Button
                          onClick={handlePublish}
                          disabled={isPublishing || !linkedinConnected}
                          className="flex-1 bg-[#0A66C2] hover:bg-[#004182] text-white"
                        >
                          {isPublishing ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Linkedin className="h-4 w-4 mr-2" />
                              Publish
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                    
                    <Button
                      onClick={handleRegenerate}
                      variant="ghost"
                      className="w-full"
                      disabled={isGenerating}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Regenerate
                    </Button>
                  </div>

                  <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                    <div className="p-4 space-y-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">Edit Post</p>
                          <button
                            type="button"
                            onClick={resetDraft}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                          >
                            Reset
                          </button>
                        </div>
                        <textarea
                          value={draftContent}
                          onChange={(e) => setDraftContent(e.target.value)}
                          rows={6}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none text-sm"
                        />
                      </div>

                      {hookSuggestions.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Hook Options</p>
                          <div className="grid gap-2">
                            {hookSuggestions.map((hook) => (
                              <button
                                key={hook}
                                type="button"
                                onClick={() => setDraftContent(prev => replaceFirstLine(prev, hook))}
                                className="w-full text-left px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-violet-400 dark:hover:border-violet-500 text-sm text-gray-700 dark:text-gray-200 transition-colors"
                              >
                                {hook}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">Hashtag Helper</p>
                          <label className="flex items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={includeHashtags}
                              onChange={(e) => setIncludeHashtags(e.target.checked)}
                              className="accent-violet-600"
                            />
                            Include on copy/publish
                          </label>
                        </div>
                        {hashtagSuggestions.length > 0 ? (
                          <>
                            <div className="flex flex-wrap gap-2">
                              {hashtagSuggestions.map((tag) => {
                                const isSelected = selectedHashtags.includes(tag);
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => toggleHashtag(tag)}
                                    className={`px-2.5 py-1 rounded-full border text-xs transition-colors ${
                                      isSelected
                                        ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200'
                                        : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-violet-400 dark:hover:border-violet-500'
                                    }`}
                                  >
                                    {tag}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex items-center gap-2 mt-3">
                              <Button type="button" size="sm" variant="outline" onClick={applyHashtags}>
                                Apply Hashtags
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setSelectedHashtags([])}
                                disabled={selectedHashtags.length === 0}
                              >
                                Clear Selection
                              </Button>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-500">Add more detail to surface stronger hashtag ideas.</p>
                        )}
                      </div>

                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Post Health</p>
                        {lengthHint && (
                          <p className="text-xs text-gray-500 mb-2">Target length: {lengthHint}</p>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                          <div className="flex items-center gap-2">
                            <Hash className="h-4 w-4 text-violet-500" />
                            {postMetrics.words} words
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-violet-500" />
                            {postMetrics.readingTime} min read
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${postMetrics.lengthStatus === 'Good' ? 'bg-green-500' : postMetrics.lengthStatus === 'Short' ? 'bg-amber-500' : 'bg-red-500'}`} />
                            {postMetrics.lengthStatus} length
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${postMetrics.hasCta ? 'bg-green-500' : 'bg-amber-500'}`} />
                            CTA {postMetrics.hasCta ? 'present' : 'missing'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${postMetrics.hasQuestion ? 'bg-green-500' : 'bg-amber-500'}`} />
                            Question {postMetrics.hasQuestion ? 'present' : 'missing'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${postMetrics.hasHashtags ? 'bg-green-500' : 'bg-amber-500'}`} />
                            Hashtags {postMetrics.hasHashtags ? 'present' : 'missing'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${postMetrics.hasEmoji ? 'bg-green-500' : 'bg-gray-300'}`} />
                            Emoji {postMetrics.hasEmoji ? 'present' : 'optional'}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${postMetrics.hasLink ? 'bg-green-500' : 'bg-gray-300'}`} />
                            Link {postMetrics.hasLink ? 'present' : 'optional'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ) : (
                <div className="p-12 text-center">
                  <div className="h-16 w-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="h-8 w-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500">
                    Your generated post will appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
