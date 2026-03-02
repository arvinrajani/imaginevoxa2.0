import { randomUUID } from 'crypto';

export type ImageJobKind = 'create' | 'edit';
export type ImageJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

type ImageJobError = {
  code: string;
  message: string;
};

type ImageJobRecord = {
  id: string;
  ownerUserId: string;
  kind: ImageJobKind;
  status: ImageJobStatus;
  progress: number;
  stage: string;
  attempts: number;
  maxAttempts: number;
  origin: string;
  cookieHeader: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: Record<string, unknown> | null;
  error: ImageJobError | null;
  cancelRequested: boolean;
  abortController: AbortController | null;
};

export type PublicImageJob = {
  id: string;
  ownerUserId: string;
  kind: ImageJobKind;
  status: ImageJobStatus;
  progress: number;
  stage: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  result: Record<string, unknown> | null;
  error: ImageJobError | null;
  canCancel: boolean;
  canRetry: boolean;
};

declare global {
  var __studioImageJobs: Map<string, ImageJobRecord> | undefined;
}

const JOB_RETENTION_MS = 1000 * 60 * 60 * 3;
const JOB_HARD_LIMIT = 600;
const jobs = globalThis.__studioImageJobs || new Map<string, ImageJobRecord>();
globalThis.__studioImageJobs = jobs;

function nowIso() {
  return new Date().toISOString();
}

function asPublic(job: ImageJobRecord): PublicImageJob {
  return {
    id: job.id,
    ownerUserId: job.ownerUserId,
    kind: job.kind,
    status: job.status,
    progress: job.progress,
    stage: job.stage,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    result: job.result,
    error: job.error,
    canCancel: job.status === 'queued' || job.status === 'running',
    canRetry: job.status === 'failed' || job.status === 'cancelled',
  };
}

function endpointForKind(kind: ImageJobKind) {
  if (kind === 'edit') return '/api/pro/image/edit-direct';
  return '/api/pro/image/create';
}

function markUpdated(job: ImageJobRecord) {
  job.updatedAt = nowIso();
}

function stageForProgress(job: ImageJobRecord, progress: number) {
  if (job.kind === 'edit') {
    if (progress < 30) return 'Validating edit request';
    if (progress < 60) return 'Applying AI retouch';
    return 'Finalizing edited image';
  }
  if (progress < 30) return 'Validating inputs';
  if (progress < 60) return 'Generating image';
  return 'Finalizing output';
}

function markCancelled(job: ImageJobRecord, message = 'Cancelled by user') {
  job.status = 'cancelled';
  job.progress = Math.min(job.progress, 100);
  job.stage = 'Cancelled';
  job.error = { code: 'cancelled', message };
  job.finishedAt = nowIso();
  job.abortController = null;
  markUpdated(job);
}

function pruneJobs() {
  const cutoff = Date.now() - JOB_RETENTION_MS;
  for (const [id, job] of jobs.entries()) {
    const updatedAt = Date.parse(job.updatedAt);
    const removableStatus =
      job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled';
    if (removableStatus && Number.isFinite(updatedAt) && updatedAt < cutoff) {
      jobs.delete(id);
    }
  }

  if (jobs.size <= JOB_HARD_LIMIT) return;
  const sorted = [...jobs.values()].sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  const toDelete = sorted.slice(0, jobs.size - JOB_HARD_LIMIT);
  for (const job of toDelete) {
    jobs.delete(job.id);
  }
}

async function runJob(job: ImageJobRecord) {
  if (job.cancelRequested) {
    markCancelled(job);
    return;
  }

  job.status = 'running';
  job.stage = 'Preparing request';
  job.progress = Math.max(job.progress, 8);
  job.startedAt = nowIso();
  job.finishedAt = null;
  job.error = null;
  job.result = null;
  markUpdated(job);

  const progressTimer = setInterval(() => {
    if (job.status !== 'running') return;
    if (job.progress < 84) {
      job.progress = Math.min(84, job.progress + 4);
      job.stage = stageForProgress(job, job.progress);
      markUpdated(job);
    }
  }, 1100);

  const controller = new AbortController();
  job.abortController = controller;

  try {
    const url = new URL(endpointForKind(job.kind), job.origin).toString();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(job.cookieHeader ? { Cookie: job.cookieHeader } : {}),
        'x-image-job-id': job.id,
      },
      body: JSON.stringify(job.payload),
      signal: controller.signal,
      cache: 'no-store',
    });

    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok) {
      const apiMessage =
        typeof payload.error === 'string' && payload.error.trim()
          ? payload.error.trim()
          : `Image request failed (${response.status})`;
      throw new Error(apiMessage);
    }

    if (job.cancelRequested) {
      markCancelled(job);
      return;
    }

    job.status = 'succeeded';
    job.progress = 100;
    job.stage = 'Completed';
    job.result = payload;
    job.error = null;
    job.finishedAt = nowIso();
    job.abortController = null;
    markUpdated(job);
  } catch (error: unknown) {
    if (job.cancelRequested || (error instanceof Error && error.name === 'AbortError')) {
      markCancelled(job);
      return;
    }

    const message = error instanceof Error ? error.message : 'Image job failed';
    job.status = 'failed';
    job.progress = Math.min(job.progress, 95);
    job.stage = 'Failed';
    job.error = { code: 'job_failed', message };
    job.result = null;
    job.finishedAt = nowIso();
    job.abortController = null;
    markUpdated(job);
  } finally {
    clearInterval(progressTimer);
    pruneJobs();
  }
}

function startJob(job: ImageJobRecord) {
  setTimeout(() => {
    void runJob(job);
  }, 0);
}

export function createImageJob(input: {
  ownerUserId: string;
  kind: ImageJobKind;
  origin: string;
  cookieHeader: string | null;
  payload: Record<string, unknown>;
  maxAttempts?: number;
}): PublicImageJob {
  const createdAt = nowIso();
  const maxAttempts = Math.max(1, Math.min(5, Math.floor(input.maxAttempts || 2)));
  const job: ImageJobRecord = {
    id: randomUUID(),
    ownerUserId: input.ownerUserId,
    kind: input.kind,
    status: 'queued',
    progress: 3,
    stage: 'Queued',
    attempts: 1,
    maxAttempts,
    origin: input.origin,
    cookieHeader: input.cookieHeader,
    payload: input.payload,
    createdAt,
    updatedAt: createdAt,
    startedAt: null,
    finishedAt: null,
    result: null,
    error: null,
    cancelRequested: false,
    abortController: null,
  };

  jobs.set(job.id, job);
  startJob(job);
  return asPublic(job);
}

export function getImageJob(jobId: string): PublicImageJob | null {
  const job = jobs.get(jobId);
  if (!job) return null;
  return asPublic(job);
}

export function getImageJobForOwner(jobId: string, ownerUserId: string): PublicImageJob | null {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== ownerUserId) return null;
  return asPublic(job);
}

export function listImageJobsForOwner(ownerUserId: string, limit = 30): PublicImageJob[] {
  return [...jobs.values()]
    .filter((job) => job.ownerUserId === ownerUserId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 100)))
    .map(asPublic);
}

export function cancelImageJobForOwner(jobId: string, ownerUserId: string): PublicImageJob | null {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== ownerUserId) return null;

  if (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled') {
    return asPublic(job);
  }

  job.cancelRequested = true;
  if (job.abortController) {
    job.abortController.abort();
  } else {
    markCancelled(job);
  }
  markUpdated(job);
  return asPublic(job);
}

export function retryImageJobForOwner(jobId: string, ownerUserId: string): PublicImageJob | null {
  const job = jobs.get(jobId);
  if (!job || job.ownerUserId !== ownerUserId) return null;
  if (job.status === 'running' || job.status === 'queued') return asPublic(job);
  if (job.attempts >= job.maxAttempts) return asPublic(job);

  job.status = 'queued';
  job.progress = 4;
  job.stage = 'Retry queued';
  job.attempts += 1;
  job.error = null;
  job.result = null;
  job.finishedAt = null;
  job.startedAt = null;
  job.cancelRequested = false;
  job.abortController = null;
  markUpdated(job);
  startJob(job);
  return asPublic(job);
}
