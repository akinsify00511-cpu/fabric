// supabase/functions/paystack-webhook/index.ts
//
// Receives Paystack webhook events, verifies the HMAC SHA512 signature,
// updates payments_paystack, marks the invoice paid, and logs income to
// the accounting payments table.
//
// SECURE: Function is public (webhook endpoint) but verifies Paystack signature
//
// Deploy:  supabase functions deploy paystack-webhook --no-verify-jwt
// Webhook URL in Paystack dashboard:
//   https://<project-ref>.supabase.co/functions/v1/paystack-webhook
// Secrets: supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SECURITY: Strict CORS for webhook endpoint
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://paystack.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'x-paystack-signature, content-type',
};

const PAYSTACK_SECRET_KEY = Deno.env.get("PAYSTACK_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  // Read the raw body first — signature is computed over the exact raw bytes
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!signature || !(await verifySignature(rawBody, signature))) {
    console.error("Invalid webhook signature");
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  console.log("Received Paystack webhook:", event.event, "reference:", event.data?.reference);

  try {
    switch (event.event) {
      case "charge.success":
        await handleChargeSuccess(supabase, event.data);
        break;
      case "charge.failed":
        await handleChargeFailed(supabase, event.data);
        break;
      case "charge.pending":
        console.log("Payment pending for:", event.data?.reference);
        break;
      default:
        console.log("Unhandled event type:", event.event);
        break;
    }
  } catch (err) {
    // Log but return 200 to avoid Paystack hammering retries on a bug
    console.error("Webhook handling error:", err);
  }

  // Always respond 200 quickly once signature is verified
  return new Response("OK", { status: 200 });
});

async function handleChargeSuccess(
  supabase: ReturnType<typeof createClient>,
  data: Record<string, unknown>
) {
  const reference = data.reference as string;

  // Find the payment record
  const { data: payment, error: findErr } = await supabase
    .from("payments_paystack")
    .select("id, business_id, invoice_id, amount_kobo, email, status")
    .eq("paystack_reference", reference)
    .single();

  if (findErr || !payment) {
    console.error("charge.success for unknown reference:", reference);
    return;
  }

  // Idempotency guard — if we've already processed this, do nothing
  if (payment.status === "success") {
    console.log("Payment already processed:", reference);
    return;
  }

  // Update payment status to success
  const { error: updateErr } = await supabase
    .from("payments_paystack")
    .update({
      status: "success",
      channel: data.channel ?? null,
      paid_at: data.paid_at ?? new Date().toISOString(),
      raw_response: data,
    })
    .eq("id", payment.id);

  if (updateErr) {
    console.error("Failed to update payment status:", updateErr);
    throw updateErr;
  }

  console.log("Payment updated to success:", reference);

  // Get invoice details for accounting
  let invoiceNumber: string | null = null;
  let clientName: string | null = null;

  if (payment.invoice_id) {
    const { data: invoice } = await supabase
      .from("invoices")
      .select("invoice_number, client_name")
      .eq("id", payment.invoice_id)
      .single();

    invoiceNumber = invoice?.invoice_number ?? null;
    clientName = invoice?.client_name ?? null;

    // Mark invoice as paid
    await supabase
      .from("invoices")
      .update({ 
        status: "paid", 
        paid_at: data.paid_at ?? new Date().toISOString() 
      })
      .eq("id", payment.invoice_id);

    console.log("Invoice marked as paid:", payment.invoice_id);
  }

  // Log the confirmed income in the accounting payments table
  // Only for 'receive' payments (incoming money)
  const { error: accountingErr } = await supabase.from("payments").insert({
    business_id: payment.business_id,
    date: new Date().toISOString().slice(0, 10),
    amount: payment.amount_kobo / 100, // Convert from kobo to major unit
    payment_type: "receive",
    payment_method: "paystack",
    reference: reference,
    invoice_id: payment.invoice_id,
    notes: invoiceNumber 
      ? `Paystack payment for invoice ${invoiceNumber}` 
      : `Paystack payment from ${payment.email}`,
  });

  if (accountingErr) {
    console.error("Failed to log accounting entry:", accountingErr);
    // Don't throw - the payment is already recorded
  } else {
    console.log("Accounting entry created for:", reference);
  }
}

async function handleChargeFailed(
  supabase: ReturnType<typeof createClient>,
  data: Record<string, unknown>
) {
  const reference = data.reference as string;

  const { error: updateErr } = await supabase
    .from("payments_paystack")
    .update({ 
      status: "failed", 
      raw_response: data 
    })
    .eq("paystack_reference", reference);

  if (updateErr) {
    console.error("Failed to update failed payment:", updateErr);
  } else {
    console.log("Payment marked as failed:", reference);
  }
}

async function verifySignature(rawBody: string, signature: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(PAYSTACK_SECRET_KEY),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"]
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
    const computed = Array.from(new Uint8Array(mac))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return timingSafeEqual(computed, signature);
  } catch (err) {
    console.error("Signature verification error:", err);
    return false;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
