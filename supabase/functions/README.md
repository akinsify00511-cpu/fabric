# Paystack Integration

This directory contains the Edge Functions for integrating with Paystack payment gateway.

## Functions

### 1. paystack-initialize
Initializes a Paystack transaction and returns the checkout URL.

**Endpoint:** `POST /functions/v1/paystack-initialize`

**Request Body:**
```json
{
  "invoice_id": "uuid"  // Optional - pulls amount/email from invoice
}
```
OR
```json
{
  "business_id": "uuid",
  "amount_kobo": 500000,
  "email": "customer@example.com",
  "currency": "NGN"
}
```

**Response:**
```json
{
  "success": true,
  "authorization_url": "https://paystack.com/pay/xxx",
  "access_code": "xxx",
  "reference": "avz_xxx"
}
```

### 2. paystack-webhook
Receives and processes Paystack webhook events (payment confirmations).

**Webhook Events Handled:**
- `charge.success` - Updates payment status, marks invoice paid, logs to accounting
- `charge.failed` - Marks payment as failed
- `charge.pending` - Logged (no action needed)

## Deployment

### Prerequisites
1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref kgsgqvatyleetyquffya
   ```

### Set Environment Secrets

```bash
supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx
supabase secrets set PAYSTACK_CALLBACK_URL=https://yourdomain.com/payment/callback
```

### Deploy Functions

```bash
# Deploy paystack-initialize (requires JWT verification)
supabase functions deploy paystack-initialize --no-verify-jwt=false

# Deploy paystack-webhook (no JWT verification - Paystack can't send auth tokens)
supabase functions deploy paystack-webhook --no-verify-jwt
```

### Get Function URLs

```bash
supabase functions list
```

## Paystack Dashboard Setup

1. Go to [Paystack Dashboard](https://dashboard.paystack.com)
2. Navigate to Settings → Webhooks
3. Add your webhook URL:
   ```
   https://kgsgqvatyleetyquffya.supabase.co/functions/v1/paystack-webhook
   ```
4. Select events to listen for:
   - `charge.success`
   - `charge.failed`
   - `charge.pending`

## Testing Locally

```bash
# Start local Supabase
supabase start

# Deploy to local
supabase functions serve paystack-initialize
supabase functions serve paystack-webhook
```

## Usage in Frontend

```typescript
import { payWithPaystack } from "@/lib/payWithPaystack";

// Pay by invoice ID (recommended)
await payWithPaystack({ invoice_id: "uuid" });

// Pay with custom amount
await payWithPaystack({
  business_id: "uuid",
  amount_kobo: 50000, // ₦500
  email: "customer@example.com"
});
```

## Database Tables

### payments_paystack
Stores Paystack transaction records:
- `id` - UUID primary key
- `business_id` - Business reference
- `invoice_id` - Optional invoice reference
- `paystack_reference` - Unique Paystack reference
- `amount_kobo` - Amount in kobo (smallest unit)
- `currency` - Currency code (NGN, USD, etc.)
- `email` - Customer email
- `status` - pending | success | failed
- `channel` - Payment channel (card, bank, etc.)
- `paid_at` - Payment timestamp
- `raw_response` - Full Paystack response JSON

### payments (accounting)
Income is logged to this table for double-entry bookkeeping when payments succeed.
