"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel max-w-md space-y-4 rounded-3xl p-8 text-center">
        <h1 className="font-display text-2xl font-semibold">Something went wrong.</h1>
        <p className="text-sm text-muted-foreground">
          We hit an unexpected error. Try refreshing this page or return to the
          generator.
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={reset}>Retry</Button>
          <Button variant="outline" asChild>
            <a href="/app/generate">Back to Generator</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
