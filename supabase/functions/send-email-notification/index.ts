// Supabase Edge Function: Send Email Notification
// Handles sending email notifications from the notifications queue
// Uses Resend for email delivery

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Email template styles - Avenize brand
const emailStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .header { background: linear-gradient(135deg, #4285F4 0%, #8B5CF6 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; text-align: center; }
  .content { background: white; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
  .footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 12px 12px; border: 1px solid #e5e7eb; border-top: none; }
  .button { display: inline-block; padding: 12px 24px; background: #4285F4; color: white; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 20px; }
  .button-secondary { background: #f3f4f6; color: #374151; }
  .alert { padding: 16px; border-radius: 8px; margin: 16px 0; }
  .alert-warning { background: #fef3c7; border: 1px solid #fbbf24; color: #92400e; }
  .alert-success { background: #d1fae5; border: 1px solid #10b981; color: #065f46; }
  h1 { margin: 0 0 10px 0; font-size: 24px; }
  h2 { margin: 20px 0 10px 0; font-size: 18px; color: #111; }
  p { margin: 10px 0; }
`

function generateEmailHTML(notification: any, user: any, appUrl: string): string {
  const categoryColors: Record<string, string> = {
    onboarding: '#8B5CF6',
    task: '#10B981',
    payment: '#4285F4',
    reminder: '#F59E0B',
    marketing: '#EC4899',
    social: '#6366F1',
    system: '#6B7280',
  }

  const accentColor = categoryColors[notification.category] || '#4285F4'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${emailStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header" style="background: linear-gradient(135deg, ${accentColor} 0%, ${accentColor}dd 100%);">
      <h1 style="color: white; margin: 0;">Avenize</h1>
    </div>
    
    <div class="content">
      <h2>Hi ${user?.full_name?.split(' ')[0] || 'there'}! 👋</h2>
      
      <h2>${notification.title}</h2>
      
      <p>${notification.message}</p>
      
      ${notification.action_url ? `
        <div style="text-align: center;">
          <a href="${appUrl}${notification.action_url}" class="button">
            ${notification.action_text || 'View Details'}
          </a>
        </div>
      ` : ''}
      
      ${notification.category === 'reminder' && notification.title.includes('trial') ? `
        <div class="alert alert-warning">
          <strong>⏰ Don't lose your progress!</strong><br>
          Upgrade before your trial ends to keep all your data, team members, and settings.
        </div>
      ` : ''}
      
      ${notification.category === 'payment' ? `
        <div class="alert alert-success">
          <strong>✓ Payment Confirmed</strong><br>
          Thank you for your purchase! Your subscription is now active.
        </div>
      ` : ''}
    </div>
    
    <div class="footer">
      <p>
        You're receiving this email because you have ${notification.channel === 'both' ? 'email notifications enabled' : 'an Avenize account'}.
      </p>
      <p>
        <a href="${appUrl}/app/notifications" style="color: #6b7280;">Manage notification preferences</a>
        • 
        <a href="${appUrl}/app/settings" style="color: #6b7280;">Account settings</a>
      </p>
      <p style="margin-top: 20px;">
        © ${new Date().getFullYear()} Avenize. The Business Operating System.<br>
        Lagos, Nigeria
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}

// Send email via Resend API
async function sendEmailViaResend(
  apiKey: string,
  to: string,
  subject: string,
  html: string,
  fromEmail: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: `Avenize <${fromEmail}>`,
        to: to,
        subject: subject,
        html: html,
      }),
    })

    const data = await response.json()

    if (response.ok) {
      return { success: true, message: data.id || 'Email sent' }
    } else {
      return { success: false, error: data.message || 'Failed to send email' }
    }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Get email configuration from settings
async function getEmailConfig(supabase: any, businessId?: string) {
  let apiKey, fromEmail
  if (businessId) {
    ({ data: apiKey } = await supabase
      .from('settings')
      .select('value')
      .eq('business_id', businessId)
      .eq('key', 'resend_api_key')
      .maybeSingle())
    ;({ data: fromEmail } = await supabase
      .from('settings')
      .select('value')
      .eq('business_id', businessId)
      .eq('key', 'email_from_address')
      .maybeSingle())
  } else {
    ({ data: apiKey } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'resend_api_key')
      .limit(1)
      .maybeSingle())
    ;({ data: fromEmail } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'email_from_address')
      .limit(1)
      .maybeSingle())
  }

  return {
    apiKey: apiKey?.value || Deno.env.get('RESEND_API_KEY'),
    fromEmail: fromEmail?.value || 'notifications@avenize.com',
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
    const appUrl = Deno.env.get('APP_URL') || 'https://app.avenize.com'

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
    const { notificationId, userId, testMode } = await req.json()

    // Get email configuration
    let emailConfig = await getEmailConfig(supabase)

    if (!emailConfig.apiKey && testMode) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Resend API key not configured. Set RESEND_API_KEY environment variable or resend_api_key in settings.',
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (testMode) {
      // Test mode - return success if configured
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Test email would be sent' + (emailConfig.apiKey ? ' via Resend' : ' (no API key configured)'),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get notification
    let notification
    if (notificationId) {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('id', notificationId)
        .single()
      notification = data
    } else if (userId) {
      // Get user's latest unsent notification
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .eq('email_sent', false)
        .eq('sent', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()
      notification = data
    }

    if (!notification) {
      return new Response(JSON.stringify({ 
        error: 'No notification found to send' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Re-resolve email config scoped to the notification's business so each
    // tenant sends from its own configured Resend key / from address.
    if (notification.business_id) {
      emailConfig = await getEmailConfig(supabase, notification.business_id)
    }

    // Get user email
    const { data: user } = await supabase
      .from('staff')
      .select('email, full_name')
      .eq('user_id', notification.user_id)
      .single()

    if (!user?.email) {
      return new Response(JSON.stringify({ 
        error: 'User email not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check user preferences
    const { data: preferences } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', notification.user_id)
      .single()

    // Check if email is allowed for this category
    const categoryToPref: Record<string, string> = {
      onboarding: 'email_onboarding',
      task: 'email_tasks',
      payment: 'email_payments',
      reminder: 'email_reminders',
      marketing: 'email_marketing',
      social: 'email_tasks',
      system: 'email_tasks',
    }
	
    const emailPref = categoryToPref[notification.category]
    if (preferences && emailPref && !preferences[emailPref]) {
      // User has opted out
      await supabase
        .from('notifications')
        .update({ email_sent: true, email_sent_at: new Date().toISOString() })
        .eq('id', notification.id)
      
      return new Response(JSON.stringify({ 
        skipped: true, 
        reason: 'User opted out of this notification type' 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Generate email content
    const emailHtml = generateEmailHTML(notification, user, appUrl)
    const emailSubject = notification.title.replace(/[\p{Emoji}]/gu, '').trim()

    // Send email via Resend if configured
    if (emailConfig.apiKey) {
      const result = await sendEmailViaResend(
        emailConfig.apiKey,
        user.email,
        emailSubject,
        emailHtml,
        emailConfig.fromEmail || 'notifications@avenize.com'
      )

      if (!result.success) {
        console.error('Failed to send email via Resend:', result.error)
      } else {
        console.log('📧 Email sent via Resend:', result.message)
      }
    } else {
      console.log('📧 Email notification (no API key configured):')
      console.log('To:', user.email)
      console.log('Subject:', emailSubject)
    }

    // Mark notification as sent
    await supabase
      .from('notifications')
      .update({ 
        email_sent: true, 
        email_sent_at: new Date().toISOString() 
      })
      .eq('id', notification.id)

    return new Response(JSON.stringify({
      success: true,
      to: user.email,
      subject: emailSubject,
      notificationId: notification.id,
      provider: emailConfig.apiKey ? 'resend' : 'none',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Email notification error:', error)
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
