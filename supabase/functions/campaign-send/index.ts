import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Server configuration incomplete' }, 500)

  const auth = req.headers.get('Authorization') || ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(url, serviceKey)
  const userClient = createClient(url, serviceKey, { global: { headers: { Authorization: auth } } })
  const { data: userData, error: userError } = await userClient.auth.getUser()
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401)

  const { data: staffRows, error: staffError } = await admin.from('staff').select('id,business_id,is_active,active').eq('user_id', userData.user.id).limit(1)
  if (staffError) return json({ error: 'Unable to resolve membership' }, 500)
  const staff = staffRows?.[0]
  if (!staff || staff.is_active === false || staff.active === false) return json({ error: 'Active business membership required' }, 403)

  const body = await req.json().catch(() => ({}))
  const campaignId = String(body.campaignId || '')
  if (!campaignId) return json({ error: 'campaignId is required' }, 400)

  const { data: campaign, error: campaignError } = await admin.from('email_campaigns').select('*').eq('id', campaignId).eq('business_id', staff.business_id).maybeSingle()
  if (campaignError) return json({ error: 'Failed to load campaign' }, 500)
  if (!campaign) return json({ error: 'Campaign not found' }, 404)
  if (!['draft', 'scheduled'].includes(campaign.status)) return json({ error: `Campaign cannot be sent from ${campaign.status} status` }, 409)

  const { data: contacts, error: contactsError } = await admin.from('email_contacts').select('id,email,first_name,last_name,status').eq('business_id', staff.business_id).eq('status', 'active').not('email', 'is', null)
  if (contactsError) return json({ error: 'Failed to load recipients' }, 500)
  if (!contacts?.length) return json({ error: 'No active email contacts' }, 409)

  await admin.from('email_campaigns').update({ status: 'sending', contact_count: contacts.length }).eq('id', campaign.id).eq('business_id', staff.business_id)

  let sent = 0
  const errors: string[] = []
  for (const contact of contacts) {
    const { data: sendRow, error: sendError } = await admin.from('email_sends').insert({ campaign_id: campaign.id, contact_id: contact.id, email: contact.email, status: 'queued' }).select('id').single()
    if (sendError || !sendRow) { errors.push(`queue:${contact.email}`); continue }
    const payload = { first_name: contact.first_name || '', last_name: contact.last_name || '', content_html: campaign.content_html || '', content_text: campaign.content_text || '', preheader: campaign.preheader || '' }
    const { data: event, error: eventError } = await admin.from('email_events').insert({ business_id: staff.business_id, recipient: contact.email, template: 'campaign_delivery', subject: campaign.subject, payload, status: 'queued' }).select('id').single()
    if (eventError || !event) { await admin.from('email_sends').update({ status: 'failed' }).eq('id', sendRow.id); errors.push(`event:${contact.email}`); continue }
    sent++
  }

  const { error: processError } = await fetch(`${url}/functions/v1/email-service`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'process', limit: Math.min(sent, 100) }) }).then(async r => r.ok ? { error: null } : { error: await r.text() }).catch(error => ({ error: String(error) }))
  const finalStatus = sent > 0 && !processError ? 'sent' : sent > 0 ? 'sending' : 'cancelled'
  await admin.from('email_campaigns').update({ status: finalStatus, sent_count: sent, sent_at: finalStatus === 'sent' ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', campaign.id).eq('business_id', staff.business_id)
  return json({ campaignId: campaign.id, sent, failed: errors.length, status: finalStatus, errors: errors.slice(0, 10) })
})
