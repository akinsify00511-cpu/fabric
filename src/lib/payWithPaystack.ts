// src/lib/payWithPaystack.ts
// Call the paystack-initialize Edge Function, then redirect the browser
// to Paystack's hosted checkout page.

import { supabase } from "./supabase";

export interface PayWithPaystackOptions {
  invoice_id?: string;
  business_id?: string;
  amount_kobo?: number;
  email?: string;
  currency?: string;
  callback_url?: string;
}

export interface PaystackInitializeResponse {
  success: boolean;
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface PaystackError {
  error: string;
  details?: unknown;
}

/**
 * Initiates a Paystack payment by calling the Edge Function
 * and redirecting to Paystack's checkout page.
 * 
 * @param options - Either invoice_id (recommended) or business_id + amount_kobo + email
 * @returns Promise that resolves with the Paystack response
 */
export async function payWithPaystack(
  options: PayWithPaystackOptions
): Promise<PaystackInitializeResponse> {
  const { data, error } = await supabase.functions.invoke<PaystackInitializeResponse | PaystackError>(
    "paystack-initialize",
    { body: options }
  );

  if (error) {
    throw new Error(error.message || "Failed to initialize payment");
  }

  if (!data || !("authorization_url" in data)) {
    throw new Error((data as PaystackError)?.error || "Invalid response from server");
  }

  // Redirect to Paystack's checkout
  // On completion, Paystack redirects to callback_url
  // The webhook is the source of truth for payment status
  window.location.href = data.authorization_url;

  return data;
}

/**
 * Check payment status from the database (client-side)
 * This only works if the user has access to the payment record
 */
export async function checkPaymentStatus(reference: string) {
  const { data, error } = await supabase
    .from("payments_paystack")
    .select("id, status, paid_at")
    .eq("paystack_reference", reference)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    status: data.status,
    paidAt: data.paid_at,
  };
}

// Example usage in a React component:
//
// ```tsx
// import { payWithPaystack } from "@/lib/payWithPaystack";
//
// function PayInvoiceButton({ invoiceId, invoiceAmount }: { invoiceId: string; invoiceAmount: number }) {
//   const handlePay = async () => {
//     try {
//       await payWithPaystack({ invoice_id: invoiceId });
//     } catch (err) {
//       console.error("Payment failed:", err);
//       alert("Failed to start payment. Please try again.");
//     }
//   };
//
//   return (
//     <button onClick={handlePay}>
//       Pay ₦{invoiceAmount.toLocaleString()}
//     </button>
//   );
// }
// ```
