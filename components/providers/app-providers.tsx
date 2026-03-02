"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { Toaster } from "sonner";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { WorkspaceProvider } from "@/lib/context/workspace-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 1,
            staleTime: 1000 * 30,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      <WorkspaceProvider>
        {children}
        <ThemeToggle />
        <Toaster richColors position="top-right" />
        <ReactQueryDevtools initialIsOpen={false} />
      </WorkspaceProvider>
    </QueryClientProvider>
  );
}
