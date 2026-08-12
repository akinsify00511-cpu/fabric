/**
 * EXECUTE-AUTOMATION EDGE FUNCTION
 * 
 * Executes automation rules based on triggers.
 * This function is designed to be called:
 * 1. By database triggers when events occur
 * 2. By pg_cron on a schedule (e.g., every minute to check "due soon" triggers)
 * 
 * Supported actions:
 * - send_notification: Creates an in-app notification
 * - create_task: Creates a new task
 * - post_to_chat: Posts a message to a chat channel
 * - award_merit: Awards recognition points
 * - update_deal: Updates deal fields
 * 
 * Usage:
 * POST /functions/v1/execute-automation
 * Headers: X-Automation-Secret: <secret>
 * Body: { "trigger": "deal_won", "payload": { deal_id: "...", ... } }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AutomationPayload {
  trigger: string
  payload: Record<string, unknown>
  automation_id?: string // Optional: execute specific automation only
}

interface Automation {
  id: string
  name: string
  trigger_type: string
  trigger_config: Record<string, unknown>
  action_type: string
  action_config: Record<string, unknown>
  enabled: boolean
  business_id: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // SECURITY: Verify the automation secret to prevent unauthorized callers
    // from triggering automations across all businesses. DB triggers pass this
    // via pg_net headers (set in app.settings.automation_secret).
    const automationSecret = Deno.env.get('AUTOMATION_SECRET')
    const providedSecret = req.headers.get('X-Automation-Secret')
    if (!automationSecret || providedSecret !== automationSecret) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    const { trigger, payload, automation_id }: AutomationPayload = await req.json()
    
    if (!trigger) {
      return new Response(
        JSON.stringify({ error: 'Missing trigger parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find matching automations
    let query = supabase
      .from('automations')
      .select('*')
      .eq('trigger_type', trigger)
      .eq('enabled', true)

    if (automation_id) {
      query = query.eq('id', automation_id)
    }

    const { data: automations, error: autoError } = await query

    if (autoError) {
      console.error('Error fetching automations:', autoError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch automations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!automations || automations.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No automations found for this trigger', executed: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Execute each automation
    const results = await Promise.allSettled(
      automations.map(async (automation: Automation) => {
        const startTime = Date.now()
        let status: 'success' | 'failed' | 'skipped' = 'success'
        let errorMessage: string | null = null

        try {
          // Execute the action based on type
          switch (automation.action_type) {
            case 'send_notification':
              await executeSendNotification(supabase, automation, payload)
              break
              
            case 'create_task':
              await executeCreateTask(supabase, automation, payload)
              break
              
            case 'post_to_chat':
              await executePostToChat(supabase, automation, payload)
              break
              
            case 'award_merit':
              await executeAwardMerit(supabase, automation, payload)
              break
              
            case 'update_deal':
              await executeUpdateDeal(supabase, automation, payload)
              break
              
            default:
              status = 'skipped'
              errorMessage = `Unknown action type: ${automation.action_type}`
          }

          const duration = Date.now() - startTime

          // Log the execution
          await supabase.from('automation_runs').insert({
            automation_id: automation.id,
            trigger_event: { trigger, payload },
            status,
            error_message: errorMessage,
            duration_ms: duration,
          })

          // Update automation stats
          await supabase.rpc('increment_automation_stats', {
            auto_id: automation.id,
            run_duration: duration,
          }).catch(() => {
            // Fallback if RPC doesn't exist
            supabase.from('automations').update({
              run_count: automation.run_count + 1,
              last_run_at: new Date().toISOString(),
            }).eq('id', automation.id)
          })

          return { automation_id: automation.id, status, error: errorMessage }
        } catch (error) {
          const duration = Date.now() - startTime
          const errorMsg = error instanceof Error ? error.message : 'Unknown error'

          // Log the failure
          await supabase.from('automation_runs').insert({
            automation_id: automation.id,
            trigger_event: { trigger, payload },
            status: 'failed',
            error_message: errorMsg,
            duration_ms: duration,
          })

          return { automation_id: automation.id, status: 'failed', error: errorMsg }
        }
      })
    )

    const successful = results.filter(r => 
      r.status === 'fulfilled' && r.value && (r.value as {status: string}).status === 'success'
    ).length
    const failed = results.length - successful

    return new Response(
      JSON.stringify({
        message: `Executed ${results.length} automations`,
        successful,
        failed,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Automation execution error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ACTION HANDLERS

async function executeSendNotification(
  supabase: ReturnType<typeof createClient>,
  automation: Automation,
  payload: Record<string, unknown>
) {
  const { title, message, user_id } = automation.action_config as {
    title?: string
    message?: string
    user_id?: string
  }

  // Generate notification content based on trigger
  const notificationTitle = title || getDefaultNotificationTitle(automation.trigger_type, payload)
  const notificationMessage = message || getDefaultNotificationMessage(automation.trigger_type, payload)

  // Get user from payload or use specified user
  const targetUserId = user_id || (payload.user_id as string) || (payload.staff_id as string)

  if (!targetUserId) {
    throw new Error('No target user specified for notification')
  }

  await supabase.from('notifications').insert({
    user_id: targetUserId,
    business_id: automation.business_id,
    title: notificationTitle,
    message: notificationMessage,
    type: 'automation',
    related_id: payload.deal_id || payload.task_id || payload.id,
    related_type: getRelatedType(automation.trigger_type),
    read: false,
  })
}

async function executeCreateTask(
  supabase: ReturnType<typeof createClient>,
  automation: Automation,
  payload: Record<string, unknown>
) {
  const config = automation.action_config as {
    title?: string
    description?: string
    assignee_id?: string
    due_date?: string
    priority?: string
  }

  const taskTitle = config.title || `Follow up from ${getDefaultNotificationTitle(automation.trigger_type, payload)}`
  const taskDescription = config.description || getDefaultNotificationMessage(automation.trigger_type, payload)

  await supabase.from('tasks').insert({
    business_id: automation.business_id,
    title: taskTitle,
    description: taskDescription,
    assigned_to: config.assignee_id || (payload.assigned_to as string),
    due_date: config.due_date || getDefaultDueDate(automation.trigger_type),
    priority: config.priority || 'medium',
    status: 'todo',
    created_by: 'automation',
  })
}

async function executePostToChat(
  supabase: ReturnType<typeof createClient>,
  automation: Automation,
  payload: Record<string, unknown>
) {
  const config = automation.action_config as {
    channel_id?: string
    message?: string
  }

  const message = config.message || getDefaultNotificationMessage(automation.trigger_type, payload)
  const channelId = config.channel_id || (payload.channel_id as string) || 'general'

  await supabase.from('messages').insert({
    channel_id: channelId,
    sender_id: 'system',
    content: `[🤖 Automation] ${message}`,
    is_system: true,
  })
}

async function executeAwardMerit(
  supabase: ReturnType<typeof createClient>,
  automation: Automation,
  payload: Record<string, unknown>
) {
  const config = automation.action_config as {
    points?: number
    reason?: string
  }

  const targetUserId = (payload.user_id || payload.staff_id) as string
  if (!targetUserId) {
    throw new Error('No target user for merit award')
  }

  await supabase.from('recognition').insert({
    user_id: targetUserId,
    business_id: automation.business_id,
    points: config.points || 10,
    reason: config.reason || getDefaultNotificationTitle(automation.trigger_type, payload),
    awarded_by: 'automation',
  })
}

async function executeUpdateDeal(
  supabase: ReturnType<typeof createClient>,
  automation: Automation,
  payload: Record<string, unknown>
) {
  const config = automation.action_config as {
    stage?: string
    notes?: string
    value_change?: number
  }

  const dealId = payload.deal_id as string
  if (!dealId) {
    throw new Error('No deal ID in payload')
  }

  const updates: Record<string, unknown> = {}
  
  if (config.stage) {
    updates.stage = config.stage
  }
  if (config.notes) {
    updates.notes = config.notes
  }
  if (config.value_change) {
    const { data: current } = await supabase
      .from('deals')
      .select('value')
      .eq('id', dealId)
      .single()
    
    if (current) {
      updates.value = current.value + config.value_change
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('deals').update(updates).eq('id', dealId)
  }
}

// HELPERS

function getDefaultNotificationTitle(trigger: string, payload: Record<string, unknown>): string {
  const titles: Record<string, string> = {
    deal_won: '🎉 Deal Won!',
    deal_lost: '😔 Deal Lost',
    deal_created: '📋 New Deal Created',
    deal_stage_changed: '🔄 Deal Stage Changed',
    invoice_paid: '💰 Invoice Paid',
    invoice_created: '📄 New Invoice Created',
    invoice_overdue: '⚠️ Invoice Overdue',
    task_completed: '✅ Task Completed',
    task_created: '✨ New Task Created',
    task_due_soon: '⏰ Task Due Soon',
    staff_joined: '👋 New Team Member',
    leave_approved: '🏖️ Leave Approved',
    product_low_stock: '⚠️ Low Stock Alert',
  }
  return titles[trigger] || 'Automation Notification'
}

function getDefaultNotificationMessage(trigger: string, payload: Record<string, unknown>): string {
  const dealTitle = payload.title || payload.deal_title || 'a deal'
  const invoiceNumber = payload.invoice_number || 'an invoice'
  const taskTitle = payload.title || payload.task_title || 'a task'
  const staffName = payload.full_name || payload.name || 'a team member'

  const messages: Record<string, string> = {
    deal_won: `Congratulations! ${dealTitle} has been won!`,
    deal_lost: `${dealTitle} was marked as lost.`,
    deal_created: `A new deal "${dealTitle}" has been created.`,
    deal_stage_changed: `${dealTitle} has moved to a new stage.`,
    invoice_paid: `${invoiceNumber} has been paid!`,
    invoice_created: `New invoice ${invoiceNumber} has been created.`,
    invoice_overdue: `${invoiceNumber} is now overdue.`,
    task_completed: `"${taskTitle}" has been marked as complete.`,
    task_created: `New task "${taskTitle}" has been assigned.`,
    task_due_soon: `"${taskTitle}" is due soon!`,
    staff_joined: `${staffName} has joined the team!`,
    leave_approved: 'A leave request has been approved.',
    product_low_stock: 'A product is running low on stock.',
  }
  return messages[trigger] || 'An automation has been triggered.'
}

function getRelatedType(trigger: string): string {
  if (trigger.startsWith('deal')) return 'deal'
  if (trigger.startsWith('invoice')) return 'invoice'
  if (trigger.startsWith('task')) return 'task'
  if (trigger.startsWith('staff') || trigger.startsWith('leave')) return 'staff'
  return 'general'
}

function getDefaultDueDate(trigger: string): string {
  const date = new Date()
  
  switch (trigger) {
    case 'task_due_soon':
      date.setDate(date.getDate() + 1)
      break
    case 'invoice_overdue':
      date.setDate(date.getDate() + 7)
      break
    default:
      date.setDate(date.getDate() + 3)
  }
  
  return date.toISOString().split('T')[0]
}
