// ============================================
// WHATSAPP BUSINESS INTEGRATION
// Send messages via WhatsApp Business API
// ============================================

// ============================================
// WHATSAPP WEB LINK (No API needed)
// ============================================

export const WhatsAppWeb = {
  // Open WhatsApp chat with a phone number
  openChat(phone: string, message?: string): void {
    // Remove non-digits
    const cleanPhone = phone.replace(/\D/g, '')
    
    // Format for WhatsApp (international format)
    let formattedPhone = cleanPhone
    if (!cleanPhone.startsWith('1') && !cleanPhone.startsWith('234') && cleanPhone.length >= 10) {
      // Assume Nigerian number if 10 digits
      if (cleanPhone.length === 10) {
        formattedPhone = '234' + cleanPhone
      }
    }
    
    // Encode message
    const encodedMessage = message ? encodeURIComponent(message) : ''
    const url = `https://wa.me/${formattedPhone}${message ? `?text=${encodedMessage}` : ''}`
    
    window.open(url, '_blank')
  },

  // Generate WhatsApp link (for buttons, etc.)
  generateLink(phone: string, message?: string): string {
    const cleanPhone = phone.replace(/\D/g, '')
    let formattedPhone = cleanPhone
    
    if (!cleanPhone.startsWith('1') && !cleanPhone.startsWith('234') && cleanPhone.length === 10) {
      formattedPhone = '234' + cleanPhone
    }
    
    const encodedMessage = message ? encodeURIComponent(message) : ''
    return `https://wa.me/${formattedPhone}${message ? `?text=${encodedMessage}` : ''}`
  },

  // Format phone number for display
  formatPhone(phone: string): string {
    const clean = phone.replace(/\D/g, '')
    
    if (clean.startsWith('234') && clean.length === 12) {
      return `+234 ${clean.slice(3, 6)} ${clean.slice(6, 9)} ${clean.slice(9)}`
    }
    if (clean.startsWith('1') && clean.length === 11) {
      return `+1 (${clean.slice(1, 4)}) ${clean.slice(4, 7)}-${clean.slice(7)}`
    }
    
    return phone
  },

  // Check if valid WhatsApp number
  isValidNumber(phone: string): boolean {
    const clean = phone.replace(/\D/g, '')
    // Basic validation: 10-15 digits
    return clean.length >= 10 && clean.length <= 15
  },
}

// ============================================
// WHATSAPP BUSINESS API — removed (was dormant + leaked the access token)
// ============================================
// The previous WhatsAppBusiness object fetched the WhatsApp access token
// from the `settings` table to the browser and called the Graph API
// directly. It had no callers (only WhatsAppWeb is used). Sending WhatsApp
// messages should route through the `send-whatsapp` edge function so the
// token stays server-side. Use WhatsAppWeb.openChat() for click-to-chat.

// ============================================
// WHATSAPP MESSAGE TEMPLATES
// ============================================

export const WHATSAPP_TEMPLATES = {
  // Invoice notification
  invoice: {
    name: 'invoice_notification',
    language: 'en',
    header: 'Invoice',
    body: 'Dear {{1}}, your invoice {{2}} for {{3}} is ready. Due date: {{4}}.',
    buttons: [
      { type: 'url', text: 'Pay Now', url: '{{5}}' },
      { type: 'phone_number', text: 'Call Us', phone_number: '{{6}}' },
    ],
  },

  // Payment confirmation
  payment: {
    name: 'payment_confirmation',
    language: 'en',
    header: 'Payment Received',
    body: 'Thank you {{1}}! We received your payment of {{2}}. Reference: {{3}}.',
    buttons: [
      { type: 'url', text: 'View Receipt', url: '{{4}}' },
    ],
  },

  // Quote
  quote: {
    name: 'quote_notification',
    language: 'en',
    header: 'Quote',
    body: 'Dear {{1}}, your quote {{2}} for {{3}} is ready. Valid until {{4}}.',
    buttons: [
      { type: 'url', text: 'View Quote', url: '{{5}}' },
    ],
  },

  // Appointment reminder
  appointment: {
    name: 'appointment_reminder',
    language: 'en',
    header: 'Appointment Reminder',
    body: 'Hi {{1}}, reminder: You have an appointment on {{2}} at {{3}}.',
    buttons: [
      { type: 'url', text: 'View Details', url: '{{4}}' },
      { type: 'url', text: 'Reschedule', url: '{{5}}' },
    ],
  },

  // Leave approval
  leave_approved: {
    name: 'leave_approved',
    language: 'en',
    header: 'Leave Approved ✓',
    body: 'Hi {{1}}, your leave ({{2}}) from {{3}} to {{4}} has been approved.',
  },

  // Welcome message
  welcome: {
    name: 'welcome_message',
    language: 'en',
    header: 'Welcome!',
    body: 'Welcome to {{1}}, {{2}}! We\'re excited to have you. Type "help" for assistance.',
  },
}

// ============================================
// WHATSAPP UTILITIES
// ============================================

export const WhatsAppUtils = {
  // Check if phone has WhatsApp (basic check)
  hasWhatsApp(phone: string): boolean {
    // In production, you'd call WhatsApp's checkPhoneNumber API
    return this.isValidPhone(phone)
  },

  // Validate phone number
  isValidPhone(phone: string): boolean {
    const clean = phone.replace(/\D/g, '')
    return clean.length >= 10 && clean.length <= 15
  },

  // Format for WhatsApp API (E.164 format)
  formatE164(phone: string): string {
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

  // Generate pre-filled message link
  generatePrefilledLink(phone: string, message: string): string {
    const link = WhatsAppWeb.generateLink(phone, message)
    return link
  },

  // Parse WhatsApp URL from message
  parseWhatsAppLink(text: string): { phone: string; message?: string } | null {
    const waMatch = text.match(/https?:\/\/wa\.me\/(\d+)/)
    if (waMatch) {
      const params = new URLSearchParams(text.split('?')[1])
      return {
        phone: waMatch[1],
        message: params.get('text') ? decodeURIComponent(params.get('text')!) : undefined,
      }
    }
    return null
  },
}

// ============================================
// IN-APP WHATSAPP BUTTON COMPONENT
// ============================================

export function WhatsAppButton({ 
  phone, 
  message, 
  children,
  className = '',
}: { 
  phone: string
  message?: string
  children?: React.ReactNode
  className?: string
}) {
  const handleClick = () => {
    WhatsAppWeb.openChat(phone, message)
  }

  return (
    <button onClick={handleClick} className={className}>
      {children || (
        <span className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Chat on WhatsApp
        </span>
      )}
    </button>
  )
}
