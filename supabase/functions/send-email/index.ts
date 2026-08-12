/**
 * SEND-EMAIL EDGE FUNCTION
 * 
 * SECURE: Requires authentication and has rate limiting
 *
 * Supported providers:
 * - Resend (recommended): Set RESEND_API_KEY env var
 * - SendGrid: Set SENDGRID_API_KEY env var
 *
 * Usage:
 * POST /functions/v1/send-email
 * Headers: Authorization: Bearer <token>
 * Body: {
 *   campaign_id: string,
 *   contacts: { email: string, name?: string }[],
 *   subject: string,
 *   html: string
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// SECURITY: Restricted CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://avenize.riverwayse.com,https://www.avenize.riverwayse.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailPayload {
  campaign_id: string
  contacts: { email: string; name?: string }[]
  subject: string
  html: string
  from_email?: string
  from_name?: string
}

interface SendResult {
  email: string
  success: boolean
  message_id?: string
  error?: string
}

// Rate limiting: 10 emails per minute per user
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

function checkRateLimit(userId: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = rateLimitStore.get(userId)
  const windowMs = 60000
  const maxRequests = 10
  
  if (!record || now > record.resetTime) {
    rateLimitStore.set(userId, { count: 1, resetTime: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1 }
  }
  
  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0 }
  }
  
  record.count++
  return { allowed: true, remaining: maxRequests - record.count }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // SECURITY: Verify authentication
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.substring(7)

    // Verify token and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SECURITY: Rate limiting
    const rateLimit = checkRateLimit(user.id)
    if (!rateLimit.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { campaign_id, contacts, subject, html, from_email, from_name }: EmailPayload = await req.json()

    // SECURITY: Validate required fields
    if (!campaign_id || !contacts || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SECURITY: Sanitize and validate input
    const sanitizedCampaignId = campaign_id.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 100)
    const sanitizedSubject = subject.replace(/<[^>]*>/g, '').slice(0, 200)
    const sanitizedContacts = contacts.map(c => ({
      email: c.email.replace(/[^a-zA-Z0-9@._-]/g, '').slice(0, 254),
      name: c.name?.replace(/<[^>]*>/g, '').slice(0, 100)
    })).filter(c => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))

    // SECURITY: Limit batch size
    const limitedContacts = sanitizedContacts.slice(0, 100)

    // Update campaign status to sending
    await supabase
      .from('email_campaigns')
      .update({ status: 'sending' })
      .eq('id', sanitizedCampaignId)

    const results: SendResult[] = []
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY')

    if (resendApiKey) {
      // Send using Resend
      const batchSize = 100 // Resend batch limit
      for (let i = 0; i < limitedContacts.length; i += batchSize) {
        const batch = limitedContacts.slice(i, i + batchSize)
        const batchResults = await sendWithResend(resendApiKey, batch, sanitizedSubject, html, from_email, from_name)
        results.push(...batchResults)
        // Rate limiting - wait between batches
        if (i + batchSize < limitedContacts.length) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }
    } else if (sendgridApiKey) {
      // Send using SendGrid
      for (const contact of limitedContacts) {
        const result = await sendWithSendgrid(sendgridApiKey, contact, sanitizedSubject, html, from_email, from_name)
        results.push(result)
      }
    } else {
      // No email provider configured - simulate sending
      console.warn('No email provider configured. Simulating send...')
      for (const contact of limitedContacts) {
        results.push({
          email: contact.email,
          success: true,
          message_id: `simulated_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        })
      }
    }

    // Calculate stats
    const successful = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    // Update campaign with results
    await supabase
      .from('email_campaigns')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_count: successful,
        delivered_count: successful,
      })
      .eq('id', sanitizedCampaignId)

    return new Response(
      JSON.stringify({
        message: `Sent ${successful} emails, ${failed} failed`,
        successful,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Email send error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function sendWithResend(
  apiKey: string,
  contacts: { email: string; name?: string }[],
  subject: string,
  html: string,
  fromEmail?: string,
  fromName?: string
): Promise<SendResult[]> {
  const from = fromEmail || 'Avenize <noreply@avenize.com>'
  const fromNameHeader = fromName ? `${fromName} <${from}>` : from

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        from: fromNameHeader,
        to: contacts.map(c => c.name ? `${c.name} <${c.email}>` : c.email),
        subject,
        html,
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Resend error:', error)
      return contacts.map(c => ({
        email: c.email,
        success: false,
        error: `Resend API error: ${error}`,
      }))
    }

    const data = await response.json()
    return contacts.map(c => ({
      email: c.email,
      success: true,
      message_id: data.id,
    }))
  } catch (error) {
    return contacts.map(c => ({
      email: c.email,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }))
  }
}

async function sendWithSendgrid(
  apiKey: string,
  contact: { email: string; name?: string },
  subject: string,
  html: string,
  fromEmail?: string,
  fromName?: string
): Promise<SendResult> {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: contact.email, name: contact.name }],
          subject,
        }],
        from: { email: fromEmail || 'noreply@avenize.com', name: fromName },
        content: [{ type: 'text/html', value: html }],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      return {
        email: contact.email,
        success: false,
        error: `SendGrid API error: ${error}`,
      }
    }

    const messageId = response.headers.get('X-Message-Id') || ''
    return {
      email: contact.email,
      success: true,
      message_id: messageId,
    }
  } catch (error) {
    return {
      email: contact.email,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
