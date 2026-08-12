// Supabase Edge Function: Send SMS via Termii
// Handles sending SMS messages from the notifications queue

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TERMII_API_URL = 'https://api.ng.termii.com/api'

interface SMSRequest {
  to: string
  message: string
  channel?: 'dnd' | 'whatsapp' | 'generic'
  business_id?: string
  save_to_logs?: boolean
}

// OTP action payloads (Termii OTP API). Routed through this edge function so
// the Termii API key never reaches the browser.
interface OtpSendPayload {
  to: string
  channel?: string
  pin_length?: number
  pin_time_to_live?: number
  pin_placeholder?: string
  message_text?: string
}
interface OtpVerifyPayload {
  pin_id: string
  pin: string
}
interface OtpResendPayload {
  pin_id: string
}

interface TermiiResponse {
  status: string
  response_code: string
  response_message: string
  message_id?: string
  pin_id?: string
  verified?: boolean
  data?: {
    balance?: number
    message?: string
    price?: number
  }
}

// Get Termii configuration from database
async function getTermiiConfig(supabase: any) {
  const { data: apiKey } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'termii_api_key')
    .single()
  
  const { data: senderId } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'termii_sender_id')
    .single()
  
  const { data: channel } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'termii_channel')
    .single()

  return {
    apiKey: apiKey?.value,
    senderId: senderId?.value || 'Avenize',
    channel: channel?.value || 'dnd',
  }
}

// Format phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  const clean = phone.replace(/\D/g, '')
  
  // If starts with 0, convert to country code (assumes Nigeria)
  if (clean.startsWith('0') && clean.length === 11) {
    return '234' + clean.slice(1)
  }
  
  // If 10 digits, add country code
  if (clean.length === 10) {
    return '234' + clean
  }
  
  // If doesn't start with +, add it
  if (!phone.startsWith('+')) {
    return '+' + clean
  }
  
  return phone
}

// Send SMS via Termii API
async function sendSMSViaTermii(config: { apiKey: string; senderId: string; channel: string }, to: string, message: string, channel: string) {
  const formattedPhone = formatPhoneNumber(to)
  
  const response = await fetch(`${TERMII_API_URL}/sms/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: config.apiKey,
      to: formattedPhone,
      from: config.senderId,
      sms: message,
      channel: channel || config.channel,
      type: 'plain',
    }),
  })

  return await response.json() as TermiiResponse
}

// Record SMS in database
async function recordSMS(
  supabase: any,
  businessId: string | undefined,
  data: {
    recipient: string
    message: string
    message_id?: string
    status: string
    error_message?: string
    channel?: string
  }
) {
  try {
    await supabase.from('sms_logs').insert({
      business_id: businessId,
      recipient: data.recipient,
      message: data.message,
      message_id: data.message_id,
      status: data.status,
      error_message: data.error_message,
      channel: data.channel,
    })
  } catch (error) {
    console.error('Failed to record SMS:', error)
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // SECURITY: Verify the caller's JWT before using the service role key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const token = authHeader.substring(7)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Parse request body
    const { to, message, channel, business_id, save_to_logs = true, action }: SMSRequest & { action?: string } = await req.json()
    
    // Get Termii configuration
    const config = await getTermiiConfig(supabase)
    
    if (!config.apiKey) {
      return new Response(JSON.stringify({
        error: 'Termii not configured. Please set termii_api_key in settings.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    // Balance action: fetch the Termii balance server-side so the API key
    // never reaches the browser. Uses the correct Termii balance endpoint
    // (api_key passed in the JSON body, per Termii docs).
    if (action === 'balance') {
      const balanceRes = await fetch(`${TERMII_API_URL}/sms/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: config.apiKey }),
      })
      const balanceData = await balanceRes.json() as TermiiResponse
      if (balanceData.status === 'success') {
        return new Response(JSON.stringify({
          success: true,
          balance: balanceData.data?.balance,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        success: false,
        error: balanceData.response_message || 'Failed to get balance',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    
    // OTP actions: send / verify / resend, all server-side so the API key
    // never reaches the browser. (Termii OTP endpoints.)
    if (action === 'otp_send') {
      const otp: OtpSendPayload = (await req.json().catch(() => ({}))) as OtpSendPayload
      const phone = otp.to || to
      if (!phone) {
        return new Response(JSON.stringify({ error: 'Missing phone number' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const formattedPhone = formatPhoneNumber(phone)
      const res = await fetch(`${TERMII_API_URL}/sms/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: config.apiKey,
          message_type: 'NUMERIC',
          to: formattedPhone,
          from: config.senderId,
          channel: otp.channel || config.channel,
          pin_attempts: 3,
          pin_length: otp.pin_length || 4,
          pin_time_to_live: otp.pin_time_to_live || 5,
          pin_placeholder: otp.pin_placeholder || '< 1234 >',
          message_text: otp.message_text || 'Your Avenize verification code is < 1234 >',
          loop: 0,
        }),
      })
      const d = await res.json() as TermiiResponse
      return new Response(JSON.stringify(d.status === 'success'
        ? { success: true, pin_id: d.pin_id }
        : { success: false, error: d.response_message || 'Failed to send OTP' }),
        { status: d.status === 'success' ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (action === 'otp_verify') {
      const otp: OtpVerifyPayload = (await req.json().catch(() => ({}))) as OtpVerifyPayload
      if (!otp.pin_id || !otp.pin) {
        return new Response(JSON.stringify({ verified: false, message: 'Missing pin_id or pin' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const res = await fetch(`${TERMII_API_URL}/sms/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: config.apiKey, pin_id: otp.pin_id, pin: otp.pin }),
      })
      const d = await res.json() as TermiiResponse
      return new Response(JSON.stringify({ verified: !!d.verified, message: d.response_message || (d.verified ? 'Verified' : 'Invalid OTP') }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    if (action === 'otp_resend') {
      const otp: OtpResendPayload = (await req.json().catch(() => ({}))) as OtpResendPayload
      if (!otp.pin_id) {
        return new Response(JSON.stringify({ success: false, error: 'Missing pin_id' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      const res = await fetch(`${TERMII_API_URL}/sms/otp/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: config.apiKey, pin_id: otp.pin_id, type: 'numeric' }),
      })
      const d = await res.json() as TermiiResponse
      return new Response(JSON.stringify(d.status === 'success'
        ? { success: true, pin_id: d.pin_id }
        : { success: false, error: d.response_message || 'Failed to resend OTP' }),
        { status: d.status === 'success' ? 200 : 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    // Validate required fields for the default send action
    if (!to || !message) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: to and message are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send SMS
    const result = await sendSMSViaTermii(config, to, message, channel || config.channel)

    if (result.status === 'success') {
      // Record SMS if requested
      if (save_to_logs) {
        await recordSMS(supabase, business_id, {
          recipient: formatPhoneNumber(to),
          message: message,
          message_id: result.message_id,
          status: 'sent',
          channel: channel || config.channel,
        })
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'SMS sent successfully',
        message_id: result.message_id,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Record failed SMS
      if (save_to_logs) {
        await recordSMS(supabase, business_id, {
          recipient: formatPhoneNumber(to),
          message: message,
          status: 'failed',
          error_message: result.response_message,
          channel: channel || config.channel,
        })
      }

      return new Response(JSON.stringify({
        success: false,
        error: result.response_message || 'Failed to send SMS',
        code: result.response_code,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error('SMS send error:', error)
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
