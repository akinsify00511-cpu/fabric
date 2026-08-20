import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://avenize.com";

const FALLBACK: Record<string, { monthly: number; yearly: number; name: string }> = {
  starter: { monthly: 1500000, yearly: 15000000, name: "Starter" },
  team: { monthly: 4800000, yearly: 48000000, name: "Team" },
  business: { monthly: 11200000, yearly: 112000000, name: "Business" },
  pro: { monthly: 18600000, yearly: 186000000, name: "Pro" },
  scale: { monthly: 38000000, yearly: 380000000, name: "Scale" },
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const auth = req.headers.get("Authorization");
    if (!auth?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const token = auth.slice(7);
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const { data: staff, error: staffError } = await admin.from("staff").select("business_id, role").eq("user_id", user.id).maybeSingle();
    if (staffError || !staff) return json({ error: "User is not associated with a business" }, 403);

    const body = await req.json();
    const planCode = String(body.plan_code || "");
    const billing = body.billing_cycle === "yearly" ? "yearly" : "monthly";
    const fallback = FALLBACK[planCode];
    if (!fallback) return json({ error: "Invalid paid plan" }, 400);

    let amountKobo = billing === "yearly" ? fallback.yearly : fallback.monthly;
    let planName = fallback.name;

    const { data: tier } = await admin
      .from("pricing_tiers")
      .select("display_name, founding_monthly_cents, founding_yearly_cents, future_monthly_cents, future_yearly_cents, founding_period_ends_at, is_sellable")
      .eq("plan_code", planCode)
      .maybeSingle();

    if (tier?.is_sellable) {
      const ended = tier.founding_period_ends_at && new Date(tier.founding_period_ends_at) < new Date();
      const price = billing === "yearly"
        ? (ended ? tier.future_yearly_cents : tier.founding_yearly_cents)
        : (ended ? tier.future_monthly_cents : tier.founding_monthly_cents);
      if (typeof price === "number") amountKobo = price;
      if (tier.display_name) planName = tier.display_name;
    }

    const email = user.email;
    if (!email) return json({ error: "Account email is required for payment" }, 400);

    const reference = `avz_sub_${crypto.randomUUID().replaceAll("-", "")}`;
    const callbackUrl = String(body.callback_url || `${APP_URL}/upgrade?plan=${encodeURIComponent(planCode)}&billing=${billing}`);

    const paystack = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        currency: "NGN",
        reference,
        callback_url: callbackUrl,
        metadata: { business_id: staff.business_id, plan_code: planCode, plan_name: planName, billing_cycle: billing, source: "avenize_subscription_checkout" },
      }),
    });
    const result = await paystack.json();
    if (!paystack.ok || !result.status || !result.data?.authorization_url) return json({ error: result.message || "Payment provider rejected checkout" }, 502);

    const { error: attemptError } = await admin.from("subscription_provider_attempts").insert({
      business_id: staff.business_id,
      provider: "paystack",
      operation: "subscription_checkout",
      idempotency_key: reference,
      status: "pending",
      provider_reference: reference,
      amount_cents: amountKobo,
      currency: "NGN",
    });
    if (attemptError) throw attemptError;

    // Do not create or activate a subscription here. The signed Paystack
    // webhook is the only authority that changes a subscription to active.
    return json({ checkout_url: result.data.authorization_url, reference });
  } catch (error) {
    console.error("subscription-checkout error", error);
    return json({ error: "Unable to create checkout" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
