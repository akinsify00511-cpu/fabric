// Supabase Edge Function: Send WhatsApp Message
// Handles sending WhatsApp notifications via Twilio

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface WhatsAppRequest {
  to: string
  message: string
  business_id?: string
  contact_id?: string
  entity_type?: string
  entity_id?: string
  template_name?: string
  template_variables?: Record<string, string>
  save_to_logs?: boolean
}

// Get Twilio configuration from database
async function getTwilioConfig(supabase: any) {
  const { data: accountSid } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'twilio_account_sid')
    .single()
  
  const { data: authToken } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'twilio_auth_token')
    .single()
  
  const { data: fromNumber } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'whatsapp_from_number')
    .single()

  return {
    accountSid: accountSid?.value || Deno.env.get('TWILIO_ACCOUNT_SID'),
    authToken: authToken?.value || Deno.env.get('TWILIO_AUTH_TOKEN'),
    fromNumber: fromNumber?.value || Deno.env.get('TWILIO_WHATSAPP_FROM'),
  }
}

// Format phone number for WhatsApp (must start with country code)
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

// Check if contact has opted in to WhatsApp
async function checkOptIn(supabase: any, phone: string, businessId?: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('whatsapp_optins')
      .select('opted_out')
      .eq('phone', formatPhoneNumber(phone))
      .eq('opted_out', false)
      .maybeSingle()
    
    // If no opt-in record exists, check if business has global consent
    if (!data && businessId) {
      const { data: settings } = await supabase
        .from('settings')
        .select('value')
        .eq('business_id', businessId)
        .eq('key', 'whatsapp_default_consent')
        .single()
      
      return settings?.value === 'true'
    }
    
    return data === null // Allow if no opt-out record
  } catch {
    return true // Default to allowing
  }
}

// Send WhatsApp message via Twilio
async function sendWhatsAppViaTwilio(
  accountSid: string,
  authToken: string,
  fromNumber: string,
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const authHeader = btoa(`${accountSid}:${authToken}`)
    
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          From: fromNumber.startsWith('whatsapp:') ? fromNumber : `whatsapp:${fromNumber}`,
          To: `whatsapp:${formatPhoneNumber(to)}`,
          Body: message,
        }),
      }
    )

    const data = await response.json()

    if (response.ok) {
      return { success: true, messageId: data.sid }
    } else {
      return { success: false, error: data.message || 'Failed to send WhatsApp message' }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Record WhatsApp message in database
async function recordWhatsAppMessage(
  supabase: any,
  data: {
    business_id?: string
    contact_id?: string
    recipient: string
    message: string
    status: string
    message_sid?: string
    error_message?: string
    entity_type?: string
    entity_id?: string
  }
) {
  try {
    await supabase.from('whatsapp_messages').insert({
      business_id: data.business_id,
      contact_id: data.contact_id,
      recipient: formatPhoneNumber(data.recipient),
      message: data.message,
      status: data.status,
      message_sid: data.message_sid,
      error_message: data.error_message,
      entity_type: data.entity_type,
      entity_id: data.entity_id,
    })
  } catch (error) {
    console.error('Failed to record WhatsApp message:', error)
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
    const { to, message, business_id, contact_id, entity_type, entity_id, save_to_logs = true }: WhatsAppRequest = await req.json()

    // Validate required fields
    if (!to || !message) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: to and message are required'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get Twilio configuration
    const config = await getTwilioConfig(supabase)
    
    if (!config.accountSid || !config.authToken || !config.fromNumber) {
      return new Response(JSON.stringify({
        error: 'WhatsApp not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_FROM environment variables or configure in settings.'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check opt-in consent
    const hasOptIn = await checkOptIn(supabase, to, business_id)
    if (!hasOptIn) {
      return new Response(JSON.stringify({
        error: 'Recipient has opted out of WhatsApp messages'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Send WhatsApp message
    const result = await sendWhatsAppViaTwilio(
      config.accountSid,
      config.authToken,
      config.fromNumber,
      to,
      message
    )

    if (result.success) {
      // Record successful message if requested
      if (save_to_logs) {
        await recordWhatsAppMessage(supabase, {
          business_id,
          contact_id,
          recipient: to,
          message,
          status: 'delivered',
          message_sid: result.messageId,
          entity_type,
          entity_id,
        })
      }

      return new Response(JSON.stringify({
        success: true,
        message: 'WhatsApp message sent successfully',
        messageId: result.messageId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else {
      // Record failed message
      if (save_to_logs) {
        await recordWhatsAppMessage(supabase, {
          business_id,
          contact_id,
          recipient: to,
          message,
          status: 'failed',
          error_message: result.error,
          entity_type,
          entity_id,
        })
      }

      return new Response(JSON.stringify({
        success: false,
        error: result.error || 'Failed to send WhatsApp message',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

  } catch (error) {
    console.error('WhatsApp send error:', error)
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
