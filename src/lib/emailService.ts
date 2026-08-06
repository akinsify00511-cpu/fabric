// ============================================
// EMAIL SERVICE
// Email templates, sending, tracking
// ============================================

import { supabase } from './supabase'

export interface EmailTemplate {
  id: string
  name: string
  category: string
  subject: string
  body_html: string
  body_text?: string
  variables?: { key: string; description: string; source: string }[]
  from_name?: string
  from_email?: string
  is_active: boolean
}

export interface Email {
  id: string
  business_id: string
  template_id?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body_html: string
  body_text?: string
  status: 'draft' | 'queued' | 'sent' | 'delivered' | 'failed'
  sent_at?: string
  delivered_at?: string
  opened_at?: string
  clicked_at?: string
  opens_count: number
  clicks_count: number
  error_message?: string
  metadata?: Record<string, any>
  created_at: string
}

// ============================================
// EMAIL VARIABLES
// ============================================

export const EMAIL_VARIABLES = {
  // Business variables
  business: {
    name: 'Business Name',
    email: 'Business Email',
    phone: 'Business Phone',
    address: 'Business Address',
    logo: 'Business Logo URL',
    website: 'Business Website',
  },
  
  // Customer variables
  customer: {
    first_name: 'Customer First Name',
    last_name: 'Customer Last Name',
    full_name: 'Customer Full Name',
    email: 'Customer Email',
    phone: 'Customer Phone',
    company: 'Company Name',
  },
  
  // Invoice variables
  invoice: {
    number: 'Invoice Number',
    date: 'Invoice Date',
    due_date: 'Due Date',
    subtotal: 'Subtotal',
    tax: 'Tax Amount',
    total: 'Total Amount',
    status: 'Invoice Status',
    link: 'Invoice Payment Link',
    items: 'Invoice Items',
  },
  
  // Quote variables
  quote: {
    number: 'Quote Number',
    date: 'Quote Date',
    valid_until: 'Valid Until',
    total: 'Quote Total',
    link: 'Quote Link',
  },
  
  // Payment variables
  payment: {
    amount: 'Payment Amount',
    method: 'Payment Method',
    date: 'Payment Date',
    reference: 'Payment Reference',
    receipt_link: 'Receipt Link',
  },
  
  // Leave variables
  leave: {
    type: 'Leave Type',
    start_date: 'Start Date',
    end_date: 'End Date',
    days: 'Number of Days',
    status: 'Leave Status',
    approver: 'Approver Name',
  },
  
  // General
  general: {
    date: 'Current Date',
    time: 'Current Time',
    year: 'Current Year',
    staff_name: 'Staff Name',
    staff_email: 'Staff Email',
  },
}

// ============================================
// TEMPLATE MANAGEMENT
// ============================================

export async function getEmailTemplates(businessId: string, category?: string): Promise<EmailTemplate[]> {
  let query = supabase
    .from('email_templates')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')

  if (category) {
    query = query.eq('category', category)
  }

  const { data } = await query
  return data || []
}

export async function getEmailTemplate(id: string): Promise<EmailTemplate | null> {
  const { data } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .single()
  return data
}

export async function createEmailTemplate(template: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .insert(template)
    .select()
    .single()

  if (error) {
    console.error('Failed to create template:', error)
    return null
  }

  return data
}

export async function updateEmailTemplate(id: string, updates: Partial<EmailTemplate>): Promise<EmailTemplate | null> {
  const { data, error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('Failed to update template:', error)
    return null
  }

  return data
}

// ============================================
// VARIABLE SUBSTITUTION
// ============================================

export function substituteVariables(
  content: string,
  variables: Record<string, any>
): string {
  let result = content

  for (const [key, value] of Object.entries(variables)) {
    const placeholders = [
      `{{${key}}}`,
      `{{${key.toLowerCase()}}}`,
      `{{${key.toUpperCase()}}}`,
      `[[${key}]]`,
      `[[${key.toLowerCase()}]]`,
    ]

    for (const placeholder of placeholders) {
      result = result.replace(new RegExp(placeholder.replace(/[{}[\]]/g, '\\$&'), 'g'), String(value ?? ''))
    }
  }

  return result
}

// ============================================
// EMAIL SENDING
// ============================================

export async function sendEmail(email: {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  body_html: string
  body_text?: string
  template_id?: string
  metadata?: Record<string, any>
}): Promise<{ success: boolean; message: string; email_id?: string }> {
  try {
    // Get current business info
    const { data: business } = await supabase.auth.getUser()
    
    // Create email record
    const { data: emailRecord, error } = await supabase
      .from('emails')
      .insert({
        business_id: (await supabase.auth.getUser()).data.user?.id,
        to: email.to,
        cc: email.cc,
        bcc: email.bcc,
        subject: email.subject,
        body_html: email.body_html,
        body_text: email.body_text,
        template_id: email.template_id,
        metadata: email.metadata,
        status: 'queued',
      })
      .select()
      .single()

    if (error) throw error

    // In production, this would call your backend API to actually send the email
    // For now, we'll simulate sending
    if (import.meta.env.VITE_API_URL) {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/emails/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_id: emailRecord.id,
          ...email,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to send email')
      }
    }

    return { success: true, message: 'Email queued', email_id: emailRecord.id }
  } catch (error) {
    console.error('Failed to send email:', error)
    return { success: false, message: (error as Error).message }
  }
}

export async function sendTemplatedEmail(
  templateId: string,
  to: string[],
  variables: Record<string, any>,
  options?: { cc?: string[]; bcc?: string[] }
): Promise<{ success: boolean; message: string; email_id?: string }> {
  const template = await getEmailTemplate(templateId)
  if (!template) {
    return { success: false, message: 'Template not found' }
  }

  // Substitute variables
  const subject = substituteVariables(template.subject, variables)
  const body_html = substituteVariables(template.body_html, variables)
  const body_text = template.body_text 
    ? substituteVariables(template.body_text, variables)
    : body_html.replace(/<[^>]*>/g, '')

  return sendEmail({
    to,
    cc: options?.cc,
    bcc: options?.bcc,
    subject,
    body_html,
    body_text,
    template_id: templateId,
    metadata: variables,
  })
}

// ============================================
// EMAIL TRACKING
// ============================================

export async function trackEmailOpen(emailId: string): Promise<void> {
  const now = new Date().toISOString()
  
  try {
    await supabase.rpc('increment_email_opens', { p_email_id: emailId })
  } catch {
    // Fallback
    const { data } = await supabase.from('emails').select('opens_count').eq('id', emailId).single()
    const newCount = (data?.opens_count || 0) + 1
    await supabase
      .from('emails')
      .update({
        opens_count: newCount,
        opened_at: now,
      })
      .eq('id', emailId)
  }
}

export async function trackEmailClick(emailId: string, url: string): Promise<void> {
  const now = new Date().toISOString()
  
  // Record click
  await supabase.from('email_clicks').insert({
    email_id: emailId,
    url,
    clicked_at: now,
  })

  // Update email stats
  try {
    await supabase.rpc('increment_email_clicks', { p_email_id: emailId })
  } catch {
    const { data } = await supabase.from('emails').select('clicks_count').eq('id', emailId).single()
    const newCount = (data?.clicks_count || 0) + 1
    await supabase
      .from('emails')
      .update({ clicks_count: newCount })
      .eq('id', emailId)
  }
}

export async function getEmailStats(businessId: string, startDate?: string, endDate?: string) {
  let query = supabase
    .from('emails')
    .select('*')
    .eq('business_id', businessId)

  if (startDate) {
    query = query.gte('created_at', startDate)
  }
  if (endDate) {
    query = query.lte('created_at', endDate)
  }

  const { data } = await query

  const stats = {
    total: data?.length || 0,
    sent: data?.filter(e => e.status === 'sent').length || 0,
    delivered: data?.filter(e => e.status === 'delivered').length || 0,
    opened: data?.filter(e => e.opened_at !== null).length || 0,
    clicked: data?.filter(e => e.clicked_at !== null).length || 0,
    failed: data?.filter(e => e.status === 'failed').length || 0,
    openRate: 0,
    clickRate: 0,
  }

  if (stats.delivered > 0) {
    stats.openRate = (stats.opened / stats.delivered) * 100
    stats.clickRate = (stats.clicked / stats.delivered) * 100
  }

  return stats
}

// ============================================
// COMMON EMAIL TEMPLATES
// ============================================

export const DEFAULT_TEMPLATES = {
  invoice: {
    name: 'Invoice Email',
    category: 'invoice',
    subject: 'Invoice {{invoice.number}} from {{business.name}}',
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #6366F1; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Invoice</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear {{customer.first_name}},</p>
          <p>Please find attached invoice <strong>{{invoice.number}}</strong> for {{invoice.total}}.</p>
          <p>Due Date: {{invoice.due_date}}</p>
          <a href="{{invoice.link}}" style="display: inline-block; background: #6366F1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
            Pay Now
          </a>
        </div>
        <div style="padding: 20px; background: #f5f5f5; text-align: center; color: #666; font-size: 12px;">
          <p>{{business.name}} | {{business.address}}</p>
          <p>Questions? Contact us at {{business.email}}</p>
        </div>
      </div>
    `,
  },
  
  quote: {
    name: 'Quote Email',
    category: 'quote',
    subject: 'Quote {{quote.number}} from {{business.name}}',
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #10B981; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">Quote</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear {{customer.first_name}},</p>
          <p>Thank you for your interest. Please find attached quote <strong>{{quote.number}}</strong> for {{quote.total}}.</p>
          <p>Valid until: {{quote.valid_until}}</p>
          <a href="{{quote.link}}" style="display: inline-block; background: #10B981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
            View Quote
          </a>
        </div>
      </div>
    `,
  },
  
  welcome: {
    name: 'Welcome Email',
    category: 'welcome',
    subject: 'Welcome to {{business.name}}!',
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="padding: 20px; text-align: center;">
          <h1 style="color: #6366F1;">Welcome to {{business.name}}!</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear {{customer.first_name}},</p>
          <p>Thank you for joining us. We're excited to have you on board!</p>
          <p>Here are some things you can do to get started:</p>
          <ul>
            <li>Complete your profile</li>
            <li>Explore our features</li>
            <li>Contact support if you need help</li>
          </ul>
        </div>
      </div>
    `,
  },
  
  leave_approved: {
    name: 'Leave Approved',
    category: 'leave',
    subject: 'Your Leave Request Has Been Approved',
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #10B981; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">✓ Leave Approved</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear {{staff_name}},</p>
          <p>Your {{leave.type}} request has been approved!</p>
          <p><strong>Dates:</strong> {{leave.start_date}} to {{leave.end_date}}</p>
          <p><strong>Days:</strong> {{leave.days}}</p>
          <p>Enjoy your time off!</p>
        </div>
      </div>
    `,
  },
  
  payment_received: {
    name: 'Payment Received',
    category: 'payment',
    subject: 'Payment Received - {{payment.reference}}',
    body_html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #10B981; color: white; padding: 20px; text-align: center;">
          <h1 style="margin: 0;">✓ Payment Received</h1>
        </div>
        <div style="padding: 20px;">
          <p>Dear {{customer.first_name}},</p>
          <p>We have received your payment of <strong>{{payment.amount}}</strong>.</p>
          <p><strong>Reference:</strong> {{payment.reference}}</p>
          <p><strong>Date:</strong> {{payment.date}}</p>
          <p><strong>Method:</strong> {{payment.method}}</p>
          <a href="{{payment.receipt_link}}" style="display: inline-block; background: #6366F1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin-top: 20px;">
            Download Receipt
          </a>
        </div>
      </div>
    `,
  },
}
