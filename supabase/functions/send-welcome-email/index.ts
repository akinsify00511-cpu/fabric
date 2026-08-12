// supabase/functions/send-welcome-email/index.ts
//
// Sends a welcome email to new users after successful signup confirmation.
// Called from the auth callback after business creation.
//
// Deploy: supabase functions deploy send-welcome-email --no-verify-jwt

import { Resend } from "https://esm.sh/resend@3.2.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Avenize <noreply@avenize.com>';
const APP_URL = Deno.env.get('APP_URL') ?? 'https://avenize.com';

const resend = new Resend(RESEND_API_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const { email, fullName, businessName } = await req.json();

    if (!email || !fullName) {
      return json({ error: 'email and fullName are required' }, 400);
    }

    // SECURITY: Verify the caller is authenticated and the email matches
    // their session. Prevents email bombing via this public endpoint.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization header' }, 401);
    }
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    if (user.email !== email) {
      return json({ error: 'Email does not match authenticated user' }, 403);
    }

    const firstName = fullName.split(' ')[0];

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: `Welcome to Avenize, ${firstName}! 🚀`,
      html: getWelcomeEmailHtml({ firstName, businessName, appUrl: APP_URL }),
      text: getWelcomeEmailText({ firstName, businessName, appUrl: APP_URL }),
    });

    if (error) {
      console.error('Resend error:', error);
      return json({ error: 'Failed to send email', details: error }, 500);
    }

    return json({ success: true, messageId: data?.id });
  } catch (err) {
    console.error('Unexpected error:', err);
    return json({ error: 'Unexpected error', details: String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getWelcomeEmailHtml({ firstName, businessName, appUrl }: {
  firstName: string;
  businessName?: string;
  appUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f5f5f5;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Welcome to Avenize! 🎉</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px; font-size: 18px; color: #1a1a1a;">Hi ${firstName},</p>
              
              <p style="margin: 0 0 24px; font-size: 16px; color: #4a4a4a; line-height: 1.6;">
                Your Avenize account is ready! ${businessName ? `Your business <strong>${businessName}</strong> has been set up,` : 'You\'re all set'}. You can now start managing your business operations, team, and customers in one place.
              </p>
              
              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="padding: 0 0 30px;">
                    <a href="${appUrl}/app" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 12px; font-weight: 600; font-size: 16px;">
                      Go to Dashboard →
                    </a>
                  </td>
                </tr>
              </table>
              
              <!-- Features -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8f8ff; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1a1a1a;">Here's what you can do:</p>
                    <ul style="margin: 0; padding-left: 20px; color: #4a4a4a; line-height: 2;">
                      <li>📊 <strong>Dashboard</strong> - Get real-time business insights</li>
                      <li>👥 <strong>Team</strong> - Invite and manage your team members</li>
                      <li>💰 <strong>Finance</strong> - Track income, expenses, and invoices</li>
                      <li>📈 <strong>Projects</strong> - Manage tasks and deliverables</li>
                    </ul>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0; font-size: 14px; color: #888888; text-align: center;">
                Need help? Reply to this email or visit our <a href="${appUrl}/help" style="color: #667eea;">Help Center</a>.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f5f5f5; padding: 24px 40px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #888888;">
                © 2024 Avenize. All rights reserved.
              </p>
              <p style="margin: 0; font-size: 12px; color: #aaaaaa;">
                If you didn't create this account, please ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function getWelcomeEmailText({ firstName, businessName, appUrl }: {
  firstName: string;
  businessName?: string;
  appUrl: string;
}): string {
  return `
Welcome to Avenize, ${firstName}! 🎉

Your Avenize account is ready! ${businessName ? `Your business "${businessName}" has been set up.` : 'You\'re all set.'} You can now start managing your business operations, team, and customers in one place.

GET STARTED:
→ ${appUrl}/app

FEATURES:
• Dashboard - Get real-time business insights
• Team - Invite and manage your team members
• Finance - Track income, expenses, and invoices
• Projects - Manage tasks and deliverables

Need help? Visit our Help Center at ${appUrl}/help or reply to this email.

© 2024 Avenize. All rights reserved.
If you didn't create this account, please ignore this email.
  `.trim();
}
