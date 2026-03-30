"use client";

import { createClient } from "@/lib/supabase/client";

export type BillingPlan = "starter" | "pro" | "business";

export type BillingAlertTone = "info" | "warning" | "error" | "success";

export type BillingAlert = {
  id: string;
  tone: BillingAlertTone;
  title: string;
  description: string;
};

export type BillingEvent = {
  id: string;
  type: string;
  amount: number | null;
  balanceAfter: number | null;
  description: string;
  createdAt: string;
};

export type BillingSnapshot = {
  userId: string;
  name: string;
  email: string;
  memberSince: string;
  plan: BillingPlan;
  planName: string;
  planPriceMonthly: number;
  planFeatures: string[];
  creditsTotal: number;
  creditsUsed: number;
  creditsRemaining: number;
  creditsUnlimited: boolean;
  subscriptionStatus: string | null;
  subscriptionPeriodEnd: string | null;
  billingSource: "live" | "fallback";
  alerts: BillingAlert[];
  events: BillingEvent[];
};

type ProfileRow = {
  full_name?: string | null;
  plan?: string | null;
  created_at?: string | null;
};

type SubscriptionRow = {
  plan_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
};

type CreditBalanceRow = {
  credits_remaining?: number | null;
  credits_used_this_period?: number | null;
  period_end?: string | null;
};

type CreditTransactionRow = {
  id?: string | null;
  transaction_type?: string | null;
  amount?: number | null;
  balance_after?: number | null;
  description?: string | null;
  created_at?: string | null;
};

export const PLAN_DEFINITIONS: Record<
  BillingPlan,
  {
    name: string;
    priceMonthly: number;
    credits: number;
    features: string[];
  }
> = {
  starter: {
    name: "Starter",
    priceMonthly: 30,
    credits: 30,
    features: [
      "30 posts/month",
      "PDF, image, and video uploads",
      "Manual LinkedIn publishing",
    ],
  },
  pro: {
    name: "Pro",
    priceMonthly: 40,
    credits: 30,
    features: [
      "30 posts/month",
      "Everything included",
      "Direct LinkedIn posting",
      "Voxa 1.0 image generation",
    ],
  },
  business: {
    name: "Pro+",
    priceMonthly: 70,
    credits: 60,
    features: [
      "60 posts/month",
      "Everything in Pro",
      "Voxa 1.5 image generation",
      "Team collaboration",
      "Priority support",
    ],
  },
};

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : "";
}

function isMissingRelationError(error: unknown, relationName: string) {
  const message = getErrorMessage(error).toLowerCase();
  const relation = relationName.toLowerCase();
  return (
    message.includes(relation) &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("relation"))
  );
}

function normalizePlan(rawPlan: unknown): BillingPlan {
  const plan = String(rawPlan || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (plan.includes("business") || plan.includes("pro+") || plan.includes("pro plus")) {
    return "business";
  }
  if (plan.includes("starter") || plan.includes("free")) {
    return "starter";
  }
  if (plan.includes("pro") || plan.includes("professional")) {
    return "pro";
  }
  return "starter";
}

function buildBillingAlerts(snapshot: Omit<BillingSnapshot, "alerts">): BillingAlert[] {
  const alerts: BillingAlert[] = [];

  if (snapshot.billingSource === "fallback") {
    alerts.push({
      id: "billing-fallback",
      tone: "info",
      title: "Live billing sync unavailable",
      description:
        "Credits are currently estimated from your generation activity because billing tables are not fully available.",
    });
  }

  const status = String(snapshot.subscriptionStatus || "").toLowerCase();
  if (status && !["active", "trialing"].includes(status)) {
    alerts.push({
      id: "subscription-status",
      tone: status === "past_due" || status === "unpaid" ? "error" : "warning",
      title: "Subscription needs attention",
      description: `Current subscription status: ${status.replace(/_/g, " ")}.`,
    });
  }

  if (!snapshot.creditsUnlimited && snapshot.creditsRemaining <= 3) {
    alerts.push({
      id: "credits-low",
      tone: snapshot.creditsRemaining === 0 ? "error" : "warning",
      title: snapshot.creditsRemaining === 0 ? "No credits remaining" : "Credits running low",
      description:
        snapshot.creditsRemaining === 0
          ? "You have used all available credits for this billing period."
          : `Only ${snapshot.creditsRemaining} credit${snapshot.creditsRemaining === 1 ? "" : "s"} remain in this billing period.`,
    });
  }

  if (snapshot.subscriptionPeriodEnd) {
    const periodEnd = new Date(snapshot.subscriptionPeriodEnd);
    if (Number.isFinite(periodEnd.getTime())) {
      const msRemaining = periodEnd.getTime() - Date.now();
      const daysRemaining = Math.ceil(msRemaining / (1000 * 60 * 60 * 24));
      if (daysRemaining >= 0 && daysRemaining <= 3) {
        alerts.push({
          id: "period-ending",
          tone: "info",
          title: "Billing cycle ending soon",
          description: `Your current billing period ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.`,
        });
      }
    }
  }

  return alerts;
}

function toBillingEvents(rows: CreditTransactionRow[] | null | undefined): BillingEvent[] {
  return (rows || [])
    .filter((row) => row && row.created_at)
    .map((row) => ({
      id: row.id || row.created_at || Math.random().toString(36).slice(2),
      type: row.transaction_type || "unknown",
      amount: typeof row.amount === "number" ? row.amount : null,
      balanceAfter: typeof row.balance_after === "number" ? row.balance_after : null,
      description: row.description || "Credit update",
      createdAt: row.created_at || new Date().toISOString(),
    }));
}

export async function fetchBillingSnapshot() {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Unauthorized");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [profileRes, postsRes, subscriptionRes, creditBalanceRes, creditTxRes, auditGenerationRes] = await Promise.all([
    supabase.from("profiles").select("full_name, plan, created_at").eq("id", user.id).maybeSingle(),
    supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", startOfMonth.toISOString()),
    supabase
      .from("subscriptions")
      .select("plan_id, status, current_period_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("credit_balances")
      .select("credits_remaining, credits_used_this_period, period_end")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("credit_transactions")
      .select("id, transaction_type, amount, balance_after, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("actor_id", user.id)
      .eq("action", "post_options_generated")
      .gte("created_at", startOfMonth.toISOString()),
  ]);

  const profile = profileRes.data ?? null;
  const subscriptionMissing = isMissingRelationError(subscriptionRes.error, "subscriptions");
  const creditBalanceMissing = isMissingRelationError(creditBalanceRes.error, "credit_balances");
  const creditTxMissing = isMissingRelationError(creditTxRes.error, "credit_transactions");
  const auditLogsMissing = isMissingRelationError(auditGenerationRes.error, "audit_logs");

  const plan = normalizePlan(subscriptionRes.data?.plan_id ?? profile?.plan ?? user.user_metadata?.plan);
  const planDefinition = PLAN_DEFINITIONS[plan];

  const postsThisMonth = postsRes.count ?? 0;
  const generationRequestsThisMonth =
    !auditLogsMissing && typeof auditGenerationRes.count === "number"
      ? auditGenerationRes.count
      : null;
  const liveCreditsRemaining =
    typeof creditBalanceRes.data?.credits_remaining === "number"
      ? creditBalanceRes.data.credits_remaining
      : null;
  const liveCreditsUsed =
    typeof creditBalanceRes.data?.credits_used_this_period === "number"
      ? creditBalanceRes.data.credits_used_this_period
      : null;

  const billingSource: BillingSnapshot["billingSource"] =
    !subscriptionMissing && !creditBalanceMissing && liveCreditsRemaining !== null ? "live" : "fallback";

  const creditsUnlimited = planDefinition.credits < 0;
  const creditsTotal = creditsUnlimited ? -1 : planDefinition.credits;
  const fallbackCreditsUsed = postsThisMonth;
  const creditsUsed = billingSource === "live" && liveCreditsUsed !== null ? liveCreditsUsed : fallbackCreditsUsed;
  const creditsRemaining =
    billingSource === "live" && liveCreditsRemaining !== null
      ? liveCreditsRemaining
      : creditsUnlimited
        ? -1
        : Math.max(0, creditsTotal - creditsUsed);

  const baseSnapshot: Omit<BillingSnapshot, "alerts"> = {
    userId: user.id,
    name:
      profile?.full_name ||
      (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "") ||
      user.email?.split("@")[0] ||
      "User",
    email: user.email || "",
    memberSince: profile?.created_at || user.created_at || new Date().toISOString(),
    plan,
    planName: planDefinition.name,
    planPriceMonthly: planDefinition.priceMonthly,
    planFeatures: planDefinition.features,
    creditsTotal,
    creditsUsed,
    creditsRemaining,
    creditsUnlimited,
    subscriptionStatus: subscriptionMissing ? null : subscriptionRes.data?.status || null,
    subscriptionPeriodEnd:
      creditBalanceRes.data?.period_end ||
      subscriptionRes.data?.current_period_end ||
      null,
    billingSource,
    events: creditTxMissing ? [] : toBillingEvents((creditTxRes.data as CreditTransactionRow[] | null) || []),
  };

  return {
    ...baseSnapshot,
    alerts: buildBillingAlerts(baseSnapshot),
  } satisfies BillingSnapshot;
}
