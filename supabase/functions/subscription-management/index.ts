// supabase/functions/subscription-management/index.ts
//
// Handles subscription management operations including:
// - Get subscription details
// - Get payment history
// - Get invoices
// - Cancel subscription
// - Create checkout session for upgrade
//
// Deploy:  supabase functions deploy subscription-management --no-verify-jwt=false
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx
//
// Actions:
// GET - Get subscription details
// POST - Create checkout, cancel, or update subscription

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_CALLBACK_URL = Deno.env.get("APP_URL") ?? "https://avenize.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Plan pricing in kobo (NGN)
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 1500000, yearly: 15000000 },
  team: { monthly: 4800000, yearly: 48000000 },
  business: { monthly: 11200000, yearly: 112000000 },
  pro: { monthly: 18600000, yearly: 186000000 },
  scale: { monthly: 38000000, yearly: 380000000 },
};

// Plan names mapping
const PLAN_NAMES: Record<string, string> = {
  starter: "Starter",
  team: "Team",
  business: "Business",
  pro: "Pro",
  scale: "Scale",
  free: "Free",
  professional: "Pro",
};

interface SubscriptionDetails {
  id: string;
  plan: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  start_date: string;
  next_billing_date: string | null;
  cancelled_at: string | null;
  trial_ends_at: string | null;
  seats_included: number;
  days_until_expiry: number | null;
  is_active: boolean;
}

interface PaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  paid_at: string;
}

interface InvoiceRecord {
  id: string;
  invoice_number: string;
  amount: number;
  currency: string;
  status: string;
  due_date: string;
  paid_at: string | null;
  pdf_url: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || (req.method === "GET" ? "get" : "create_checkout");

  try {
    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Get user's business
    const { data: staffData, error: staffError } = await supabase
      .from("staff")
      .select("business_id, role")
      .eq("user_id", user.id)
      .single();

    if (staffError || !staffData) {
      return json({ error: "User not associated with a business" }, 400);
    }

    const businessId = staffData.business_id;

    switch (action) {
      case "get":
        return await handleGetSubscription(supabase, businessId);
      
      case "payments":
        return await handleGetPayments(supabase, businessId);
      
      case "invoices":
        return await handleGetInvoices(supabase, businessId);
      
      case "cancel":
        return await handleCancelSubscription(supabase, businessId, await req.json());
      
      case "create_checkout":
        return await handleCreateCheckout(supabase, businessId, await req.json(), user.email);
      
      case "available_plans":
        return handleGetAvailablePlans();
      
      default:
        return json({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (error) {
    console.error("Subscription error:", error);
    return json({ error: "Internal server error" }, 500);
  }
});

async function handleGetSubscription(supabase: any, businessId: string): Promise<Response> {
  const { data: subscription, error } = await supabase
    .from("business_subscriptions")
    .select("*")
    .eq("business_id", businessId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching subscription:", error);
    return json({ error: "Failed to fetch subscription" }, 500);
  }

  // If no subscription exists, check business entitlements for plan info
  if (!subscription) {
    const { data: entitlement } = await supabase
      .from("business_entitlements")
      .select("plan")
      .eq("business_id", businessId)
      .single();

    return json({
      subscription: null,
      plan: entitlement?.plan || "free",
      message: "No active subscription found",
    });
  }

  // Calculate days until expiry
  let daysUntilExpiry: number | null = null;
  if (subscription.next_billing_date) {
    const expiryDate = new Date(subscription.next_billing_date);
    const today = new Date();
    daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  }

  const details: SubscriptionDetails = {
    id: subscription.id,
    plan: subscription.plan_code || subscription.plan_name?.toLowerCase() || "free",
    plan_name: subscription.plan_name || PLAN_NAMES[subscription.plan_code] || "Free",
    status: subscription.status,
    billing_cycle: subscription.billing_cycle,
    amount: subscription.amount_cents / 100,
    currency: subscription.currency,
    start_date: subscription.start_date,
    next_billing_date: subscription.next_billing_date,
    cancelled_at: subscription.cancelled_at,
    trial_ends_at: subscription.trial_ends_at,
    seats_included: subscription.seats_included || 5,
    days_until_expiry: daysUntilExpiry,
    is_active: subscription.status === "active" || subscription.status === "trialing",
  };

  return json({ subscription: details });
}

async function handleGetPayments(supabase: any, businessId: string): Promise<Response> {
  const { data: payments, error } = await supabase
    .from("subscription_payments")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching payments:", error);
    return json({ error: "Failed to fetch payments" }, 500);
  }

  const paymentList: PaymentRecord[] = (payments || []).map((p: any) => ({
    id: p.id,
    amount: p.amount_cents / 100,
    currency: p.currency,
    status: p.status,
    description: p.description || `${PLAN_NAMES[p.provider]} payment`,
    paid_at: p.paid_at || p.created_at,
  }));

  return json({ payments: paymentList });
}

async function handleGetInvoices(supabase: any, businessId: string): Promise<Response> {
  const { data: invoices, error } = await supabase
    .from("subscription_invoices")
    .select("*")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching invoices:", error);
    return json({ error: "Failed to fetch invoices" }, 500);
  }

  const invoiceList: InvoiceRecord[] = (invoices || []).map((inv: any) => ({
    id: inv.id,
    invoice_number: inv.invoice_number,
    amount: inv.amount_cents / 100,
    currency: inv.currency,
    status: inv.status,
    due_date: inv.due_date,
    paid_at: inv.paid_at,
    pdf_url: inv.pdf_url,
  }));

  return json({ invoices: invoiceList });
}

async function handleCancelSubscription(supabase: any, businessId: string, body: any): Promise<Response> {
  const { cancel_at_period_end = true } = body;

  // Call the database function to cancel
  const { data: subscription, error } = await supabase
    .rpc("cancel_subscription", {
      p_business_id: businessId,
      p_cancel_at_period_end: cancel_at_period_end,
    });

  if (error) {
    console.error("Error cancelling subscription:", error);
    return json({ error: "Failed to cancel subscription" }, 500);
  }

  return json({
    success: true,
    message: cancel_at_period_end
      ? "Subscription will be cancelled at the end of the billing period"
      : "Subscription cancelled immediately",
    subscription,
  });
}

async function handleCreateCheckout(
  supabase: any,
  businessId: string,
  body: any,
  userEmail: string | undefined
): Promise<Response> {
  const { plan_code, billing_cycle = "monthly" } = body;

  if (!plan_code || !PLAN_PRICES[plan_code]) {
    return json({ error: "Invalid plan code" }, 400);
  }

  const amountKobo = PLAN_PRICES[plan_code][billing_cycle as keyof typeof PLAN_PRICES[typeof plan_code]];
  const planName = PLAN_NAMES[plan_code];

  // Create a checkout session with Paystack
  const callbackUrl = `${DEFAULT_CALLBACK_URL}/app/subscription?success=true`;

  try {
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        email: userEmail,
        amount: amountKobo,
        currency: "NGN",
        callback_url: callbackUrl,
        metadata: {
          business_id: businessId,
          plan_code,
          plan_name: planName,
          billing_cycle,
        },
      }),
    });

    const result = await response.json();

    if (!result.status) {
      return json({ error: result.message || "Failed to create checkout" }, 400);
    }

    // Store pending subscription info
    await supabase.from("business_subscriptions").upsert({
      business_id: businessId,
      provider: "paystack",
      plan_code,
      plan_name: planName,
      status: "trialing",
      billing_cycle,
      amount_cents: amountKobo,
      currency: "NGN",
      start_date: new Date().toISOString(),
      next_billing_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    });

    return json({
      checkout_url: result.data.authorization_url,
      reference: result.data.reference,
    });
  } catch (error) {
    console.error("Paystack error:", error);
    return json({ error: "Failed to connect to payment provider" }, 500);
  }
}

function handleGetAvailablePlans(): Response {
  const plans = Object.entries(PLAN_PRICES).map(([code, prices]) => ({
    code,
    name: PLAN_NAMES[code],
    monthly_price: prices.monthly / 100,
    yearly_price: prices.yearly / 100,
    yearly_monthly_equivalent: prices.yearly / 100 / 12,
    savings_percent: Math.round((1 - prices.yearly / (prices.monthly * 12)) * 100),
  }));

  return json({ plans });
}

function json(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
