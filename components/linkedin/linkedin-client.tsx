"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type LinkedInConnection = {
  id: string;
  member_urn: string | null;
  orgs: { urn: string; name?: string }[];
  expires_at: string | null;
  org_expires_at?: string | null;
  org_connected?: boolean;
};

export function LinkedInClient({ isConfigured }: { isConfigured: boolean }) {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();

  useEffect(() => {
    const status = searchParams.get("status");
    const error = searchParams.get("error");
    if (status === "connected") {
      toast.success("LinkedIn connected.");
    }
    if (status === "disconnected") {
      toast.success("LinkedIn disconnected.");
    }
    if (error) {
      toast.error(error);
    }
  }, [searchParams]);

  const connectionQuery = useQuery({
    queryKey: ["linkedin-connection"],
    queryFn: async () => {
      const response = await fetch("/api/linkedin/connection");
      if (!response.ok) {
        throw new Error("Unable to load LinkedIn status.");
      }
      return (await response.json()) as LinkedInConnection | null;
    },
  });

  useEffect(() => {
    if (connectionQuery.error) {
      toast.error("Unable to load LinkedIn status.");
    }
  }, [connectionQuery.error]);

  const handleDisconnect = async () => {
    const response = await fetch("/api/linkedin/disconnect", {
      method: "POST",
    });

    if (!response.ok) {
      toast.error("Failed to disconnect.");
      return;
    }

    toast.success("LinkedIn disconnected.");
    queryClient.invalidateQueries({ queryKey: ["linkedin-connection"] });
  };

  const connection = connectionQuery.data ?? null;
  const isConnected = Boolean(connection?.id);

  return (
    <Card className="glass-panel border-white/40">
      <CardHeader className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
          LinkedIn
        </p>
        <h2 className="text-xl font-semibold">Connection Status</h2>
        <p className="text-sm text-muted-foreground">
          Connect your LinkedIn account to publish to personal or organization pages.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isConfigured && (
          <div className="rounded-2xl border border-dashed bg-muted/40 p-4 text-sm text-muted-foreground">
            LinkedIn is not configured yet. Set the LinkedIn environment variables to
            enable OAuth.
          </div>
        )}
        <div className="flex items-center justify-between rounded-2xl border bg-background/70 p-4">
          <div>
            <p className="text-sm font-semibold">LinkedIn</p>
            <p className="text-xs text-muted-foreground">
              {isConnected ? "Connected" : "Not connected"}
            </p>
          </div>
          <Badge variant={isConnected ? "secondary" : "outline"}>
            {isConnected ? "Connected" : "Not connected"}
          </Badge>
        </div>
        {isConnected && (
          <div className="space-y-2 rounded-2xl border bg-muted/40 p-4 text-xs text-muted-foreground">
            <p>Member URN: {connection?.member_urn || "-"}</p>
            <p>Organizations: {connection?.orgs?.length || 0}</p>
            <p>Org app connected: {connection?.org_connected ? "Yes" : "No"}</p>
            {connection?.orgs?.length ? (
              <div className="mt-2 space-y-1">
                {connection.orgs.map((org) => (
                  <p key={org.urn}>{org.name || org.urn}</p>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button asChild disabled={!isConfigured || connectionQuery.isLoading}>
            <a href="/api/linkedin/start">
              {isConnected ? "Reconnect LinkedIn" : "Connect LinkedIn"}
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={!isConnected}
          >
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
