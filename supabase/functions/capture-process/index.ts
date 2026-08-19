/**
 * CAPTURE-PROCESS EDGE FUNCTION
 *
 * Server-side processing for Quick Capture multimodal attachments
 * (checklist item 3 — Mic transcript + Image OCR).
 *
 * Actions:
 *   transcribe — audio attachment → Whisper → transcript saved to
 *                capture_attachments.transcript (via save_capture_transcript
 *                semantics, done here with the service role after an
 *                explicit membership check).
 *   ocr        — image attachment → GPT-4o-mini vision → structured
 *                extraction {vendor, amount, currency, date, line_items,
 *                confidence} saved to capture_attachments.ocr.
 *
 * Security (matches transcribe-audio): verifies the caller's JWT, then
 * explicitly verifies the caller belongs to the attachment's business
 * BEFORE using the service role. The attachment row + storage object are
 * private (signed paths only, §32).
 *
 * §22 anti-fabrication: the OCR prompt instructs "If you cannot identify
 * the field, use null. Do not fabricate." The extraction is advisory —
 * the human confirms/edits before it becomes a capture.
 *
 * Environment variables required:
 * - OPENAI_API_KEY
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BUCKET = 'capture-attachments'

interface ProcessPayload {
  attachment_id: string
  action: 'transcribe' | 'ocr'
  language?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      return json({ error: 'AI processing is not configured' }, 500)
    }

    // Verify the caller's JWT before any service-role use
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Unauthorized' }, 401)
    }
    const token = authHeader.substring(7)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { attachment_id, action, language }: ProcessPayload = await req.json()
    if (!attachment_id || (action !== 'transcribe' && action !== 'ocr')) {
      return json({ error: 'Missing or invalid fields' }, 400)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Load the attachment
    const { data: attachment, error: attError } = await supabase
      .from('capture_attachments')
      .select('id, business_id, kind, mime_type, storage_path, status')
      .eq('id', attachment_id)
      .maybeSingle()
    if (attError || !attachment) {
      return json({ error: 'Attachment not found' }, 404)
    }

    // Explicit membership check (defense in depth — the client RPCs are
    // membership-gated too, but this function uses the service role).
    const { data: membership } = await supabase
      .from('staff')
      .select('id')
      .eq('user_id', user.id)
      .eq('business_id', attachment.business_id)
      .limit(1)
    if (!membership || membership.length === 0) {
      return json({ error: 'Not authorized for this attachment' }, 403)
    }

    // Kind/action agreement
    if (action === 'transcribe' && attachment.kind !== 'audio') {
      return json({ error: 'transcribe requires an audio attachment' }, 400)
    }
    if (action === 'ocr' && attachment.kind !== 'image') {
      return json({ error: 'ocr requires an image attachment' }, 400)
    }

    // Download the object from the private bucket (service role)
    const { data: fileData, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(attachment.storage_path)
    if (dlError || !fileData) {
      return json({ error: 'Could not read the uploaded file' }, 500)
    }

    if (action === 'transcribe') {
      const formData = new FormData()
      const ext = attachment.mime_type.includes('webm') ? 'webm'
        : attachment.mime_type.includes('mp4') ? 'm4a'
        : attachment.mime_type.includes('mpeg') ? 'mp3'
        : attachment.mime_type.includes('wav') ? 'wav'
        : 'webm'
      formData.append('file', new File([await fileData.arrayBuffer()], `audio.${ext}`, { type: attachment.mime_type }))
      formData.append('model', 'whisper-1')
      if (language) formData.append('language', language)
      formData.append('response_format', 'text')

      const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiApiKey}` },
        body: formData,
        signal: AbortSignal.timeout(60000),
      })
      if (!whisperRes.ok) {
        const errText = await whisperRes.text()
        console.error('Whisper error:', errText)
        await supabase
          .from('capture_attachments')
          .update({ transcript_status: 'failed' })
          .eq('id', attachment_id)
        return json({ error: 'Transcription failed' }, 500)
      }
      const transcript = (await whisperRes.text()).trim()

      await supabase
        .from('capture_attachments')
        .update({ transcript, transcript_status: 'completed' })
        .eq('id', attachment_id)

      return json({ attachment_id, transcript })
    }

    // action === 'ocr'
    const arrayBuffer = await fileData.arrayBuffer()
    const base64 = btoa(
      new Uint8Array(arrayBuffer).reduce((acc, b) => acc + String.fromCharCode(b), '')
    )
    const dataUrl = `data:${attachment.mime_type};base64,${base64}`

    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'You extract structured data from receipt/invoice/document images. ' +
              'Return ONLY valid JSON with these fields: vendor (string|null), ' +
              'amount (number|null, total only), currency (string|null, e.g. "NGN"), ' +
              'date (string|null, ISO YYYY-MM-DD), line_items (array of {description, amount}|[]), ' +
              'confidence (number 0-1). If you cannot identify a field, use null. Do not fabricate.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the transaction data from this image.' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        max_tokens: 800,
        temperature: 0,
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!visionRes.ok) {
      const errText = await visionRes.text()
      console.error('Vision error:', errText)
      await supabase
        .from('capture_attachments')
        .update({ ocr_status: 'failed' })
        .eq('id', attachment_id)
      return json({ error: 'OCR extraction failed' }, 500)
    }

    const visionData = await visionRes.json()
    const raw = visionData.choices?.[0]?.message?.content ?? '{}'
    let ocr: Record<string, unknown>
    try {
      ocr = JSON.parse(raw.replace(/```json|```/g, '').trim())
    } catch {
      ocr = { confidence: 0, parse_error: true }
    }

    await supabase
      .from('capture_attachments')
      .update({ ocr, ocr_status: 'completed' })
      .eq('id', attachment_id)

    return json({ attachment_id, ocr })
  } catch (err) {
    console.error('capture-process error:', err)
    return json({ error: 'Internal error' }, 500)
  }
})
