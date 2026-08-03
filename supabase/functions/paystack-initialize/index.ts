// supabase/functions/paystack-initialize/index.ts
//
// Initializes a Paystack transaction for an invoice (or ad-hoc amount) and
// returns the checkout authorization_url to redirect the client to.
//
// Deploy:  supabase functions deploy paystack-initialize --no-verify-jwt=false
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx
//
// Request body:
// {
//   "invoice_id": "uuid",       // optional — if provided, amount/email/business_id are pulled from it
//   "business_id": "uuid",      // required if invoice_id is not provided
//   "amount_kobo": 500000,      // required if invoice_id is not provided (amount in kobo)
//   "email": "customer@example.com", // required if invoice_id is not provided
//   "currency": "NGN",          // optional, defaults to NGN
//   "callback_url": "https://yourdomain.com/pay/callback" // optional override
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_CALLBACK_URL = Deno.env.get("PAYSTACK_CALLBACK_URL") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    let { invoice_id, business_id, amount_kobo, email, currency = "NGN" } = body;
    const callback_url = body.callback_url || DEFAULT_CALLBACK_URL || undefined;

    // If an invoice_id is supplied, pull the authoritative amount/email/business from it
    if (invoice_id) {
      const { data: invoice, error: invoiceErr } = await supabase
        .from("invoices")
        .select("id, business_id, total, currency, client_email, status")
        .eq("id", invoice_id)
        .single();

      if (invoiceErr || !invoice) {
        return json({ error: "Invoice not found" }, 404);
      }
      if (invoice.status === "paid") {
        return json({ error: "Invoice already paid" }, 409);
      }

      business_id = invoice.business_id;
      email = invoice.client_email;
      currency = invoice.currency || currency;
      // Convert major currency unit to kobo (multiply by 100)
      amount_kobo = Math.round(Number(invoice.total) * 100);
    }

    if (!business_id || !amount_kobo || !email) {
      return json(
        { error: "business_id, amount_kobo and email are required (directly or via invoice_id)" },
        400
      );
    }

    // Generate a unique reference we control for reliable webhook lookup
    const reference = `avz_${crypto.randomUUID().replace(/-/g, "")}`;

    // Call Paystack to initialize the transaction
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amount_kobo,
        currency,
        reference,
        callback_url,
        metadata: { 
          business_id, 
          invoice_id: invoice_id ?? null,
          source: "avenize"
        },
      }),
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      console.error("Paystack init failed:", paystackData);
      return json({ error: "Paystack initialize failed", details: paystackData }, 502);
    }

    // Record the pending payment before redirecting the user
    const { error: insertErr } = await supabase.from("payments_paystack").insert({
      business_id,
      invoice_id: invoice_id ?? null,
      paystack_reference: reference,
      amount_kobo,
      currency,
      email,
      status: "pending",
      raw_response: paystackData.data,
    });

    if (insertErr) {
      console.error("Failed to record payment:", insertErr);
      return json({ error: "Failed to record pending payment", details: insertErr.message }, 500);
    }

    return json({
      success: true,
      authorization_url: paystackData.data.authorization_url,
      access_code: paystackData.data.access_code,
      reference,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Unexpected error", details: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
