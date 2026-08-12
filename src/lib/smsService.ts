// ============================================
// TERMII SMS SERVICE
// Send SMS messages via Termii API
// ============================================

import { supabase } from './supabase'

export interface SMSConfig {
  apiKey: string
  senderId: string
  channel?: 'dnd' | 'whatsapp' | 'generic'
}

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

const TERMII_API_URL = 'https://api.ng.termii.com/api'

// ============================================
// SMS SERVICE (Client-side methods)
// ============================================

export const TermiiSMS = {
  // Get configuration from database settings
  async getConfig(): Promise<SMSConfig | null> {
    try {
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

      if (!apiKey?.value) {
        return null
      }

      return {
        apiKey: apiKey.value,
        senderId: senderId?.value || 'Avenize',
        channel: (channel?.value as 'dnd' | 'whatsapp' | 'generic') || 'dnd',
      }
    } catch (error) {
      console.error('Failed to get Termii config:', error)
      return null
    }
  },

  // Save configuration to database
  async saveConfig(config: SMSConfig): Promise<boolean> {
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

  // Check if Termii is configured
  async isConfigured(): Promise<boolean> {
    const config = await this.getConfig()
    return !!config?.apiKey
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

  // Send SMS directly from client (requires API key exposed - use edge function instead)
  async sendDirect(message: SMSMessage): Promise<SMSResponse> {
    const config = await this.getConfig()
    
    if (!config) {
      return { success: false, message: 'Termii not configured', error: 'Please configure Termii API key' }
    }

    try {
      // Format phone number
      const formattedPhone = this.formatPhoneNumber(message.to)

      const response = await fetch(`${TERMII_API_URL}/sms/send`, {
        signal: AbortSignal.timeout(10000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: config.apiKey,
          to: formattedPhone,
          from: config.senderId,
          sms: message.message,
          channel: message.channel || config.channel || 'dnd',
          type: 'plain',
        }),
      })

      const data = await response.json()

      if (data.status === 'success') {
        // Record the SMS
        await this.recordSMS({
          to: formattedPhone,
          message: message.message,
          message_id: data.message_id,
          status: 'sent',
        })

        return {
          success: true,
          message: 'SMS sent successfully',
          message_id: data.message_id,
        }
      } else {
        return {
          success: false,
          message: data.response_message || 'Failed to send SMS',
          error: data.response_code,
        }
      }
    } catch (error) {
      console.error('SMS send error:', error)
      return { success: false, message: 'Network error', error: (error as Error).message }
    }
  },

  // Send bulk SMS
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

  // Get SMS balance
  async getBalance(): Promise<{ success: boolean; balance?: number; error?: string }> {
    const config = await this.getConfig()
    
    if (!config) {
      return { success: false, error: 'Termii not configured' }
    }

    try {
      const response = await fetch(`${TERMII_API_URL}/sms/balance`, {
        signal: AbortSignal.timeout(10000),
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (data.status === 'success') {
        return {
          success: true,
          balance: data.data.balance,
        }
      } else {
        return {
          success: false,
          error: data.response_message || 'Failed to get balance',
        }
      }
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
  // Send OTP to phone number
  async send(phone: string, config?: OTPConfig): Promise<OTPResponse> {
    const termiiConfig = await TermiiSMS.getConfig()
    
    if (!termiiConfig) {
      return { success: false, error: 'Termii not configured' }
    }

    try {
      const formattedPhone = TermiiSMS.formatPhoneNumber(phone)

      const response = await fetch(`${TERMII_API_URL}/api/sms/otp/send`, {
        signal: AbortSignal.timeout(10000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: termiiConfig.apiKey,
          message_type: 'NUMERIC',
          to: formattedPhone,
          from: termiiConfig.senderId,
          channel: config?.channel || 'dnd',
          pin_attempts: 3,
          pin_length: config?.length || 4,
          pin_time_to_live: config?.lifetime || 5,
          pin_placeholder: config?.placeholder || '< 1234 >',
          message_text: config?.placeholder || 'Your Avenize verification code is < 1234 >',
          loop: 0,
        }),
      })

      const data = await response.json()

      if (data.status === 'success') {
        // Record OTP request
        await this.recordOTPRequest(formattedPhone, data.pin_id, 'sent')

        return {
          success: true,
          messageId: data.pin_id,
          message: 'OTP sent successfully',
        }
      } else {
        return {
          success: false,
          error: data.response_message || 'Failed to send OTP',
        }
      }
    } catch (error) {
      console.error('OTP send error:', error)
      return { success: false, error: (error as Error).message }
    }
  },

  // Verify OTP
  async verify(pinId: string, otp: string): Promise<VerifyOTPResponse> {
    const config = await TermiiSMS.getConfig()
    
    if (!config) {
      return { verified: false, message: 'Termii not configured' }
    }

    try {
      const response = await fetch(`${TERMII_API_URL}/api/sms/otp/verify`, {
        signal: AbortSignal.timeout(10000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: config.apiKey,
          pin_id: pinId,
          pin: otp,
        }),
      })

      const data = await response.json()

      if (data.verified) {
        await this.recordOTPRequest('', pinId, 'verified')
        return { verified: true, message: 'OTP verified successfully' }
      } else {
        return { verified: false, message: data.response_message || 'Invalid OTP' }
      }
    } catch (error) {
      console.error('OTP verify error:', error)
      return { verified: false, message: (error as Error).message }
    }
  },

  // Resend OTP
  async resend(pinId: string): Promise<OTPResponse> {
    const config = await TermiiSMS.getConfig()
    
    if (!config) {
      return { success: false, error: 'Termii not configured' }
    }

    try {
      const response = await fetch(`${TERMII_API_URL}/api/sms/otp/resend`, {
        signal: AbortSignal.timeout(10000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: config.apiKey,
          pin_id: pinId,
          type: 'numeric',
        }),
      })

      const data = await response.json()

      if (data.status === 'success') {
        return {
          success: true,
          messageId: data.pin_id,
          message: 'OTP resent successfully',
        }
      } else {
        return {
          success: false,
          error: data.response_message || 'Failed to resend OTP',
        }
      }
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
