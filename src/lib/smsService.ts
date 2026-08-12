// ============================================
// TERMII SMS SERVICE
// Send SMS messages via Termii API
// ============================================

import { supabase } from './supabase'

export interface SMSMessage {
  to: string
  message: string
  channel?: 'dnd' | 'whatsapp' | 'generic'
}

export interface SMSResponse {
  success: boolean
  message: string
  message_id?: string
  balance?: number
  error?: string
}

export interface SMSTemplate {
  slug: string
  name: string
  message: string
  variables: string[]
}

export interface OTPConfig {
  length?: number
  type?: 'numeric' | 'alphanumeric'
  lifetime?: number
  placeholder?: string
  ticktime?: number
  channel?: 'sms' | 'whatsapp' | 'voice'
}

export interface OTPResponse {
  success: boolean
  code?: string
  messageId?: string
  message?: string
  error?: string
}

export interface VerifyOTPResponse {
  verified: boolean
  message: string
}

// ============================================
// TERMII API CONFIGURATION
// ============================================


// ============================================
// SMS SERVICE (Client-side methods)
// ============================================

export const TermiiSMS = {
  // Check whether a Termii API key is configured, WITHOUT fetching the secret
  // value to the browser. Reads only the sender_id / channel (non-secret) for
  // display. The API key itself stays server-side (used by the send-sms edge
  // function); the settings page sets/replaces it but never reads it back.
  async getConfig(): Promise<{ senderId: string; channel: 'dnd' | 'whatsapp' | 'generic'; hasApiKey: boolean } | null> {
    try {
      const { data: apiKeyRow } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'termii_api_key')
        .maybeSingle()

      const { data: senderId } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'termii_sender_id')
        .maybeSingle()

      const { data: channel } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'termii_channel')
        .maybeSingle()

      return {
        hasApiKey: !!apiKeyRow?.value,
        senderId: senderId?.value || 'Avenize',
        channel: (channel?.value as 'dnd' | 'whatsapp' | 'generic') || 'dnd',
      }
    } catch (error) {
      console.error('Failed to get Termii config:', error)
      return null
    }
  },

  // Save configuration to database. The API key is written (upserted) but is
  // never read back for display — the page shows a masked placeholder instead.
  async saveConfig(config: { apiKey: string; senderId: string; channel?: 'dnd' | 'whatsapp' | 'generic' }): Promise<boolean> {
    try {
      const { error: apiKeyError } = await supabase
        .from('settings')
        .upsert({ key: 'termii_api_key', value: config.apiKey, type: 'secret' }, { onConflict: 'key' })

      const { error: senderIdError } = await supabase
        .from('settings')
        .upsert({ key: 'termii_sender_id', value: config.senderId, type: 'string' }, { onConflict: 'key' })

      if (config.channel) {
        await supabase
          .from('settings')
          .upsert({ key: 'termii_channel', value: config.channel, type: 'string' }, { onConflict: 'key' })
      }

      return !apiKeyError && !senderIdError
    } catch (error) {
      console.error('Failed to save Termii config:', error)
      return false
    }
  },

  // Check if Termii is configured (does not fetch the secret value).
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig()
    return !!config?.hasApiKey
  },

  // Send SMS via Edge Function (recommended - keeps API key server-side)
  async sendViaEdgeFunction(message: SMSMessage): Promise<SMSResponse> {
    try {
      const { data: business } = await supabase.auth.getUser()

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          to: message.to,
          message: message.message,
          channel: message.channel || 'dnd',
          business_id: business.user?.id,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        return { success: false, message: data.error || 'Failed to send SMS', error: data.error }
      }

      return {
        success: true,
        message: 'SMS sent successfully',
        message_id: data.message_id,
      }
    } catch (error) {
      console.error('SMS send error:', error)
      return { success: false, message: 'Network error', error: (error as Error).message }
    }
  },

  // Send bulk SMS (routes each through the server-side edge function).
  async sendBulk(messages: SMSMessage[]): Promise<{ success: boolean; results: SMSResponse[] }> {
    const results: SMSResponse[] = []

    for (const message of messages) {
      const result = await this.sendViaEdgeFunction(message)
      results.push(result)
    }

    return {
      success: results.every(r => r.success),
      results,
    }
  },

  // Get SMS balance via the server-side edge function (action: 'balance') so
  // the Termii API key never reaches the browser. Previously this called the
  // Termii balance endpoint directly without passing the key (always failed)
  // and leaked the key — both fixed by routing through send-sms.
  async getBalance(): Promise<{ success: boolean; balance?: number; error?: string }> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ action: 'balance' }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        return { success: true, balance: data.balance }
      }
      return { success: false, error: data.error || 'Failed to get balance' }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },

  // Get SMS history from database
  async getHistory(limit: number = 50, offset: number = 0) {
    try {
      const { data, error, count } = await supabase
        .from('sms_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) throw error

      return { data: data || [], count: count || 0 }
    } catch (error) {
      console.error('Failed to get SMS history:', error)
      return { data: [], count: 0 }
    }
  },

  // Record SMS in database
  async recordSMS(sms: {
    to: string
    message: string
    message_id?: string
    status: string
    error?: string
  }): Promise<void> {
    try {
      const { data: business } = await supabase.auth.getUser()
      
      await supabase.from('sms_logs').insert({
        business_id: business.user?.id,
        recipient: sms.to,
        message: sms.message,
        message_id: sms.message_id,
        status: sms.status,
        error_message: sms.error,
      })
    } catch (error) {
      console.error('Failed to record SMS:', error)
    }
  },

  // Format phone number for Termii (E.164 format)
  formatPhoneNumber(phone: string): string {
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
  },

  // Validate phone number
  isValidPhoneNumber(phone: string): boolean {
    const clean = phone.replace(/\D/g, '')
    // Nigerian numbers: 11 digits starting with 0, or 13 digits starting with 234
    // International: 10-15 digits
    return (clean.length >= 10 && clean.length <= 15)
  },
}

// ============================================
// OTP SERVICE
// ============================================

export const TermiiOTP = {
  // All OTP actions route through the server-side send-sms edge function
  // (actions: otp_send / otp_verify / otp_resend) so the Termii API key is
  // never read by the browser.
  async send(phone: string, config?: OTPConfig): Promise<OTPResponse> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          action: 'otp_send',
          to: phone,
          channel: config?.channel,
          pin_length: config?.length,
          pin_time_to_live: config?.lifetime,
          pin_placeholder: config?.placeholder,
          message_text: config?.placeholder,
        }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        return { success: true, messageId: data.pin_id, message: 'OTP sent successfully' }
      }
      return { success: false, error: data.error || 'Failed to send OTP' }
    } catch (error) {
      console.error('OTP send error:', error)
      return { success: false, error: (error as Error).message }
    }
  },

  async verify(pinId: string, otp: string): Promise<VerifyOTPResponse> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ action: 'otp_verify', pin_id: pinId, pin: otp }),
      })
      const data = await response.json()
      return { verified: !!data.verified, message: data.message || (data.verified ? 'OTP verified successfully' : 'Invalid OTP') }
    } catch (error) {
      console.error('OTP verify error:', error)
      return { verified: false, message: (error as Error).message }
    }
  },

  async resend(pinId: string): Promise<OTPResponse> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({ action: 'otp_resend', pin_id: pinId }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        return { success: true, messageId: data.pin_id, message: 'OTP resent successfully' }
      }
      return { success: false, error: data.error || 'Failed to resend OTP' }
    } catch (error) {
      console.error('OTP resend error:', error)
      return { success: false, error: (error as Error).message }
    }
  },

  // Record OTP request
  async recordOTPRequest(phone: string, pinId: string, status: string): Promise<void> {
    try {
      const { data: business } = await supabase.auth.getUser()
      await supabase.from('otp_requests').insert({
        business_id: business.user?.id,
        phone: phone,
        pin_id: pinId,
        status: status,
      })
    } catch (error) {
      console.error('Failed to record OTP request:', error)
    }
  },
}

// ============================================
// SMS TEMPLATES
// ============================================

export const SMS_TEMPLATES: Record<string, SMSTemplate> = {
  // Invoice notification
  invoice: {
    slug: 'invoice',
    name: 'Invoice Ready',
    message: 'Hi {{customer_name}}, your invoice {{invoice_number}} for {{amount}} is ready. Due date: {{due_date}}. Pay now: {{payment_link}}',
    variables: ['customer_name', 'invoice_number', 'amount', 'due_date', 'payment_link'],
  },

  // Payment confirmation
  payment: {
    slug: 'payment',
    name: 'Payment Received',
    message: 'Thank you {{customer_name}}! We received your payment of {{amount}}. Reference: {{reference}}. Transaction successful.',
    variables: ['customer_name', 'amount', 'reference'],
  },

  // Task reminder
  task_reminder: {
    slug: 'task_reminder',
    name: 'Task Reminder',
    message: '⏰ Task Reminder: {{task_name}} is due {{due_date}}. Assigned by {{assigner}}. View in Avenize.',
    variables: ['task_name', 'due_date', 'assigner'],
  },

  // Meeting reminder
  meeting_reminder: {
    slug: 'meeting_reminder',
    name: 'Meeting Reminder',
    message: '📅 Meeting Reminder: {{meeting_title}} starts in {{time_until}}. Join: {{meeting_link}}',
    variables: ['meeting_title', 'time_until', 'meeting_link'],
  },

  // Welcome message
  welcome: {
    slug: 'welcome',
    name: 'Welcome',
    message: 'Welcome to {{business_name}}, {{customer_name}}! Your account is ready. Explore at {{app_link}}',
    variables: ['business_name', 'customer_name', 'app_link'],
  },

  // Leave approval
  leave_approved: {
    slug: 'leave_approved',
    name: 'Leave Approved',
    message: '✅ Leave Approved: Your {{leave_type}} from {{start_date}} to {{end_date}} has been approved by {{approver}}.',
    variables: ['leave_type', 'start_date', 'end_date', 'approver'],
  },

  // Leave rejection
  leave_rejected: {
    slug: 'leave_rejected',
    name: 'Leave Rejected',
    message: '❌ Leave Update: Your {{leave_type}} request for {{start_date}} to {{end_date}} was not approved. Contact {{approver}} for details.',
    variables: ['leave_type', 'start_date', 'end_date', 'approver'],
  },

  // Deal won
  deal_won: {
    slug: 'deal_won',
    name: 'Deal Won',
    message: '🎉 Congratulations! Deal "{{deal_name}}" worth {{amount}} has been won! Great work, {{owner}}!',
    variables: ['deal_name', 'amount', 'owner'],
  },

  // Deal lost
  deal_lost: {
    slug: 'deal_lost',
    name: 'Deal Lost',
    message: 'Deal "{{deal_name}}" worth {{amount}} was marked as lost. {{owner}}, check CRM for follow-up.',
    variables: ['deal_name', 'amount', 'owner'],
  },

  // Password reset
  password_reset: {
    slug: 'password_reset',
    name: 'Password Reset',
    message: '🔐 Password Reset: Your code is {{code}}. Valid for {{validity}}. Ignore if not requested.',
    variables: ['code', 'validity'],
  },

  // 2FA verification
  two_factor: {
    slug: 'two_factor',
    name: '2FA Code',
    message: '🔐 Avenize 2FA: Your verification code is {{code}}. Do not share this code.',
    variables: ['code'],
  },
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

export const SMSUtils = {
  // Substitute variables in template
  substituteTemplate(template: SMSTemplate, variables: Record<string, string>): string {
    let message = template.message
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`{{${key}}}`, 'g'), value)
    }
    return message
  },

  // Send templated SMS
  async sendTemplated(
    templateSlug: string,
    phone: string,
    variables: Record<string, string>
  ): Promise<SMSResponse> {
    const template = SMS_TEMPLATES[templateSlug]
    if (!template) {
      return { success: false, message: 'Template not found', error: 'Invalid template' }
    }

    const message = this.substituteTemplate(template, variables)
    return TermiiSMS.sendViaEdgeFunction({ to: phone, message })
  },

  // Format SMS for display
  formatSMSTime(timestamp: string): string {
    const date = new Date(timestamp)
    return date.toLocaleString()
  },

  // Calculate SMS cost (rough estimate)
  calculateSMSCount(message: string): number {
    // GSM-7 encoding: 160 chars per SMS
    // UCS-2 encoding: 70 chars per SMS
    const GSM_7_LENGTH = 160
    const UCS_2_LENGTH = 70
    const CONCAT_SEGMENT_GSM = 153
    const CONCAT_SEGMENT_UCS = 67

    // Check if message contains unicode characters
    const hasUnicode = /[^\x00-\x7F]/.test(message)

    if (message.length <= (hasUnicode ? UCS_2_LENGTH : GSM_7_LENGTH)) {
      return 1
    }

    return Math.ceil(message.length / (hasUnicode ? CONCAT_SEGMENT_UCS : CONCAT_SEGMENT_GSM))
  },

  // Get channel display name
  getChannelName(channel: string): string {
    const channels: Record<string, string> = {
      dnd: 'DND (Do Not Disturb)',
      whatsapp: 'WhatsApp',
      generic: 'Generic',
    }
    return channels[channel] || channel
  },

  // Get status display name
  getStatusName(status: string): string {
    const statuses: Record<string, string> = {
      pending: 'Pending',
      sent: 'Sent',
      delivered: 'Delivered',
      failed: 'Failed',
      rejected: 'Rejected',
    }
    return statuses[status] || status
  },
}

// ============================================
// DEFAULT EXPORT
// ============================================

export default {
  SMS: TermiiSMS,
  OTP: TermiiOTP,
  Templates: SMS_TEMPLATES,
  Utils: SMSUtils,
}
