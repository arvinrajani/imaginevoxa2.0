'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { StudioChannel, StudioRun, StudioRunPatch } from '@/lib/studio/types';

type UseStudioRunResult = {
  runs: StudioRun[];
  currentRun: StudioRun | null;
  loading: boolean;
  saving: boolean;
  refreshRuns: () => Promise<void>;
  setCurrentRun: (run: StudioRun | null) => void;
  createRun: (options: {
    selectedChannels?: StudioChannel[];
    primaryChannel?: StudioChannel;
    evidenceIds?: string[];
  }) => Promise<StudioRun | null>;
  updateRun: (patch: StudioRunPatch, runIdOverride?: string) => Promise<StudioRun | null>;
  requestApproval: (notes?: string) => Promise<StudioRun | null>;
  approveRun: (notes?: string) => Promise<StudioRun | null>;
  queuePublish: (scheduledAt?: string | null) => Promise<boolean>;
};

export function useStudioRun(brandId: string | null): UseStudioRunResult {
  const [runs, setRuns] = useState<StudioRun[]>([]);
  const [currentRun, setCurrentRun] = useState<StudioRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshRuns = useCallback(async () => {
    if (!brandId) {
      setRuns([]);
      setCurrentRun(null);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/studio/run/list?brandId=${encodeURIComponent(brandId)}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorPayload.error || 'Failed to load runs');
      }

      const payload = (await response.json()) as { runs?: StudioRun[] };
      const nextRuns = Array.isArray(payload.runs) ? payload.runs : [];
      setRuns(nextRuns);

      setCurrentRun((prev) => {
        if (!prev) return nextRuns[0] || null;
        return nextRuns.find((run) => run.id === prev.id) || nextRuns[0] || null;
      });
    } catch (error) {
      toast.error('Could not load run history', {
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => {
    setCurrentRun(null);
    void refreshRuns();
  }, [refreshRuns]);

  const createRun = useCallback(
    async (options: {
      selectedChannels?: StudioChannel[];
      primaryChannel?: StudioChannel;
      evidenceIds?: string[];
    }) => {
      if (!brandId) return null;
      setSaving(true);
      try {
        const response = await fetch('/api/studio/run/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandId,
            selectedChannels: options.selectedChannels,
            primaryChannel: options.primaryChannel,
            evidenceIds: options.evidenceIds,
          }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to create run');
        }

        const payload = (await response.json()) as { run?: StudioRun };
        const run = payload.run || null;
        if (run) {
          setCurrentRun(run);
          setRuns((prev) => [run, ...prev.filter((entry) => entry.id !== run.id)]);
        }
        return run;
      } catch (error) {
        toast.error('Could not create run', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [brandId]
  );

  const updateRun = useCallback(
    async (patch: StudioRunPatch, runIdOverride?: string) => {
      const runId = runIdOverride || currentRun?.id;
      if (!runId) return null;
      setSaving(true);
      try {
        const response = await fetch('/api/studio/run/update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId,
            patch,
          }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to update run');
        }

        const payload = (await response.json()) as { run?: StudioRun };
        const run = payload.run || null;
        if (run) {
          setCurrentRun(run);
          setRuns((prev) => [run, ...prev.filter((entry) => entry.id !== run.id)]);
        }
        return run;
      } catch (error) {
        toast.error('Could not save run', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [currentRun?.id]
  );

  const updateRunApproval = useCallback(
    async (action: 'request' | 'approve', notes?: string) => {
      if (!currentRun?.id) return null;
      setSaving(true);
      try {
        const response = await fetch('/api/studio/run/approve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId: currentRun.id,
            action,
            notes: notes || '',
          }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to update approval');
        }

        const payload = (await response.json()) as { run?: StudioRun };
        const run = payload.run || null;
        if (run) {
          setCurrentRun(run);
          setRuns((prev) => [run, ...prev.filter((entry) => entry.id !== run.id)]);
        }

        return run;
      } catch (error) {
        toast.error('Approval update failed', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
        return null;
      } finally {
        setSaving(false);
      }
    },
    [currentRun?.id]
  );

  const requestApproval = useCallback(
    async (notes?: string) => {
      const run = await updateRunApproval('request', notes);
      if (run) {
        toast.success('Run moved to review');
      }
      return run;
    },
    [updateRunApproval]
  );

  const approveRun = useCallback(
    async (notes?: string) => {
      const run = await updateRunApproval('approve', notes);
      if (run) {
        toast.success('Run approved');
      }
      return run;
    },
    [updateRunApproval]
  );

  const queuePublish = useCallback(
    async (scheduledAt?: string | null) => {
      if (!currentRun?.id) return false;
      setSaving(true);
      try {
        const response = await fetch('/api/studio/publish/queue', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            runId: currentRun.id,
            scheduled_at: scheduledAt || null,
          }),
        });

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(errorPayload.error || 'Failed to queue publish');
        }

        toast.success(scheduledAt ? 'Publish scheduled' : 'Added to publish queue');
        return true;
      } catch (error) {
        toast.error('Could not queue publish', {
          description: error instanceof Error ? error.message : 'Please try again.',
        });
        return false;
      } finally {
        setSaving(false);
      }
    },
    [currentRun?.id]
  );

  return {
    runs,
    currentRun,
    loading,
    saving,
    refreshRuns,
    setCurrentRun,
    createRun,
    updateRun,
    requestApproval,
    approveRun,
    queuePublish,
  };
}

export function useRunEvidenceSummary(run: StudioRun | null, evidenceCount: number) {
  return useMemo(() => {
    if (!run) return 'No run selected.';
    const selectedChannels = Array.isArray(run.selected_channels) ? run.selected_channels : [];
    return `${selectedChannels.length} channels • ${evidenceCount} evidence item${evidenceCount === 1 ? '' : 's'} • ${run.status}`;
  }, [run, evidenceCount]);
}




