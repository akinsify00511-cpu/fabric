// WhatsApp Notification Service
// Helper functions for sending WhatsApp notifications via Twilio

import { supabase } from './supabase'

const WHATSAPP_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`

interface WhatsAppMessageParams {
  to: string
  message: string
  businessId?: string
  contactId?: string
  entityType?: string
  entityId?: string
}

// Send WhatsApp message
export async function sendWhatsAppMessage(params: WhatsAppMessageParams): Promise<{
  success: boolean
  messageId?: string
  error?: string
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    
    const response = await fetch(WHATSAPP_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({
        to: params.to,
        message: params.message,
        business_id: params.businessId,
        contact_id: params.contactId,
        entity_type: params.entityType,
        entity_id: params.entityId,
        save_to_logs: true,
      }),
    })

    const data = await response.json()
    
    if (response.ok) {
      return { success: true, messageId: data.messageId }
    } else {
      return { success: false, error: data.error }
    }
  } catch (error) {
    console.error('WhatsApp send error:', error)
    return { success: false, error: (error as Error).message }
  }
}

// Notify appointment reminder via WhatsApp
export async function notifyAppointmentReminder(
  phone: string,
  appointmentDetails: {
    customerName: string
    serviceName: string
    dateTime: string
    location?: string
    businessName?: string
  },
  businessId?: string
) {
  const businessName = appointmentDetails.businessName || 'Avenize'
  const locationLine = appointmentDetails.location 
    ? `\n📍 Location: ${appointmentDetails.location}`
    : ''

  const message = `Hi ${appointmentDetails.customerName}!

⏰ Reminder: Your ${appointmentDetails.serviceName} appointment

📅 Date & Time: ${appointmentDetails.dateTime}${locationLine}

Reply CONFIRM to confirm or call us to reschedule.

- ${businessName}`

  return sendWhatsAppMessage({
    to: phone,
    message,
    businessId,
    entityType: 'appointment',
  })
}

// Notify task assignment via WhatsApp
export async function notifyTaskAssignment(
  phone: string,
  taskDetails: {
    assigneeName: string
    taskName: string
    dueDate: string
    projectName?: string
  },
  businessId?: string
) {
  const projectLine = taskDetails.projectName 
    ? `\n📂 Project: ${taskDetails.projectName}` 
    : ''

  const message = `Hi ${taskDetails.assigneeName}!

📋 New Task Assigned

Task: ${taskDetails.taskName}${projectLine}
⏰ Due: ${taskDetails.dueDate}

View details in Avenize to get started.`

  return sendWhatsAppMessage({
    to: phone,
    message,
    businessId,
    entityType: 'task',
  })
}

// Notify payment received via WhatsApp
export async function notifyPaymentReceived(
  phone: string,
  paymentDetails: {
    customerName: string
    amount: string
    invoiceNumber: string
    paymentMethod?: string
  },
  businessId?: string
) {
  const methodLine = paymentDetails.paymentMethod 
    ? `\n💳 Method: ${paymentDetails.paymentMethod}` 
    : ''

  const message = `Hi ${paymentDetails.customerName}!

✅ Payment Received

Amount: ${paymentDetails.amount}
Invoice: ${paymentDetails.invoiceNumber}${methodLine}

Thank you for your payment!

- Avenize`

  return sendWhatsAppMessage({
    to: phone,
    message,
    businessId,
    entityType: 'payment',
  })
}

// Notify team member joined via WhatsApp
export async function notifyTeamJoined(
  phone: string,
  memberDetails: {
    memberName: string
    memberEmail: string
    businessName: string
    inviterName: string
  },
  businessId?: string
) {
  const message = `Welcome to ${memberDetails.businessName}! 🎉

Hi ${memberDetails.memberName},

You've been invited to join ${memberDetails.businessName} by ${memberDetails.inviterName}.

Click the link in your email to get started and access your new workspace.

- The ${memberDetails.businessName} Team`

  return sendWhatsAppMessage({
    to: phone,
    message,
    businessId,
    entityType: 'team_invite',
  })
}

// Notify invoice ready via WhatsApp
export async function notifyInvoiceReady(
  phone: string,
  invoiceDetails: {
    customerName: string
    invoiceNumber: string
    amount: string
    dueDate: string
    paymentLink?: string
  },
  businessId?: string
) {
  const linkLine = invoiceDetails.paymentLink 
    ? `\n\n💳 Pay now: ${invoiceDetails.paymentLink}` 
    : ''

  const message = `Hi ${invoiceDetails.customerName},

📄 New Invoice Ready

Invoice: ${invoiceDetails.invoiceNumber}
Amount Due: ${invoiceDetails.amount}
Due Date: ${invoiceDetails.dueDate}${linkLine}

Please review and arrange payment at your earliest convenience.

- Avenize`

  return sendWhatsAppMessage({
    to: phone,
    message,
    businessId,
    entityType: 'invoice',
  })
}

// Check if WhatsApp is configured
export async function isWhatsAppConfigured(): Promise<boolean> {
  try {
    const response = await fetch(`${WHATSAPP_FUNCTION_URL}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: '',
        message: '',
        testMode: true,
      }),
    })

    const data = await response.json()
    return data.error !== 'WhatsApp not configured'
  } catch {
    return false
  }
}

// Get WhatsApp message logs
export async function getWhatsAppLogs(
  businessId: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Failed to fetch WhatsApp logs:', error)
    return []
  }
}
