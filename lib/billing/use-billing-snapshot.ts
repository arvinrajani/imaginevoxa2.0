"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { fetchBillingSnapshot } from "@/lib/billing/client";

export const BILLING_QUERY_KEY = ["billing-snapshot"] as const;

export function useBillingSnapshot() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: BILLING_QUERY_KEY,
    queryFn: fetchBillingSnapshot,
    retry: 0,
    staleTime: 1000 * 15,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 1000 * 60,
  });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [queryClient]);

  useEffect(() => {
    const supabase = createClient();
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        void queryClient.removeQueries({ queryKey: BILLING_QUERY_KEY });
        return;
      }
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [queryClient]);

  useEffect(() => {
    const userId = query.data?.userId;
    if (!userId) return;

    const supabase = createClient();
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: BILLING_QUERY_KEY });
    };

    const channel = supabase
      .channel(`billing-live-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "posts", filter: `user_id=eq.${userId}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${userId}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_balances", filter: `user_id=eq.${userId}` },
        refresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_transactions", filter: `user_id=eq.${userId}` },
        refresh
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query.data?.userId, queryClient]);

  return query;
}
