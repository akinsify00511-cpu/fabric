-- Test SQL queries for Paystack integration
-- Run these in the Supabase SQL Editor to verify the setup

-- 1. Check if payments_paystack table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name = 'payments_paystack';

-- 2. Check RLS policies on payments_paystack
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'payments_paystack';

-- 3. Check if function exists
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE '%payments%';

-- 4. Check triggers
SELECT 
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation
FROM information_schema.triggers 
WHERE event_object_schema = 'public';

-- 5. Test the webhook endpoint (simulate Paystack webhook)
-- Replace with your actual test data
DO $$
DECLARE
  test_payload JSONB;
  test_signature TEXT;
BEGIN
  test_payload := '{
    "event": "charge.success",
    "data": {
      "reference": "avz_test123",
      "amount": 500000,
      "currency": "NGN",
      "channel": "card",
      "paid_at": "2024-01-15T10:30:00.000Z"
    }
  }'::JSONB;
  
  RAISE NOTICE 'Test payload created: %', test_payload;
END $$;

-- 6. Check payments_paystack records
SELECT 
  id,
  business_id,
  invoice_id,
  paystack_reference,
  amount_kobo,
  status,
  created_at
FROM payments_paystack
ORDER BY created_at DESC
LIMIT 10;

-- 7. Check accounting payments for recent income
SELECT 
  id,
  business_id,
  payment_type,
  payment_method,
  amount,
  reference,
  date,
  created_at
FROM payments
WHERE payment_type = 'receive'
ORDER BY created_at DESC
LIMIT 10;
