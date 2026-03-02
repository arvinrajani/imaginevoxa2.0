'use client';

import { Clock3, History, RotateCcw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StudioRun } from '@/lib/studio/types';

type RunsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runs: StudioRun[];
  currentRunId: string | null;
  loading: boolean;
  onRestoreRun: (run: StudioRun) => void;
  onCreateRun?: () => void;
};

function statusBadgeClass(status: StudioRun['status']) {
  if (status === 'APPROVED') return 'bg-emerald-50/20 text-emerald-200 border-emerald-300/30';
  if (status === 'IN_REVIEW') return 'bg-amber-50/20 text-amber-100 border-amber-300/30';
  return 'bg-slate-50/20 text-gray-700 border-slate-300/30';
}

function formatRunDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleString();
}

export function RunsModal({
  open,
  onOpenChange,
  runs,
  currentRunId,
  loading,
  onRestoreRun,
  onCreateRun,
}: RunsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-gray-200/60 bg-white text-gray-900 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-cyan-600" />
            Run History
          </DialogTitle>
          <DialogDescription className="text-gray-600">
            Restore a previous run into the current pipeline without changing your layout.
          </DialogDescription>
        </DialogHeader>

        {onCreateRun ? (
          <div className="flex justify-end">
            <Button
              onClick={onCreateRun}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white"
            >
              <Sparkles className="mr-1.5 h-4 w-4" />
              Start New Run
            </Button>
          </div>
        ) : null}

        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {loading ? (
            <p className="text-sm text-gray-600">Loading run history...</p>
          ) : runs.length === 0 ? (
            <p className="text-sm text-gray-600">No runs yet. Confirm a post to create your first run.</p>
          ) : (
            runs.map((run) => {
              const selectedChannels = Array.isArray(run.selected_channels)
                ? run.selected_channels
                : [];
              const postHeadline = run.confirmed_post?.headline || 'No confirmed post yet';

              return (
                <div
                  key={run.id}
                  className={`rounded-xl border p-3 ${
                    run.id === currentRunId
                      ? 'border-cyan-400 bg-cyan-50'
                      : 'border-gray-200/60 bg-white/5'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">{postHeadline}</p>
                      <p className="mt-1 text-xs text-gray-600">
                        {selectedChannels.length} channel{selectedChannels.length === 1 ? '' : 's'} - primary {run.primary_channel}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                        <Clock3 className="h-3.5 w-3.5" />
                        Updated {formatRunDate(run.updated_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={`border ${statusBadgeClass(run.status)}`}>{run.status}</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onRestoreRun(run)}
                        className="border-gray-200 bg-gray-50 text-gray-800 hover:bg-gray-100"
                      >
                        <RotateCcw className="mr-1 h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
