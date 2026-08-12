/**
 * TRANSCRIBE-AUDIO EDGE FUNCTION
 *
 * Transcribes audio files using OpenAI Whisper API.
 * Also generates summaries using GPT-4.
 *
 * Environment variables required:
 * - OPENAI_API_KEY: OpenAI API key for Whisper and GPT
 *
 * Usage:
 * POST /functions/v1/transcribe-audio
 * Body: {
 *   meeting_id: string,
 *   audio_url: string (Supabase Storage URL),
 *   language?: string (e.g., "en", "yo", "ha")
 * }
 *
 * Response:
 * {
 *   meeting_id: string,
 *   transcript: string,
 *   summary: string,
 *   duration_seconds: number
 * }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TranscribePayload {
  meeting_id: string
  audio_url: string
  language?: string
}

interface TranscribeResult {
  meeting_id: string
  transcript: string
  summary: string
  duration_seconds: number
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SECURITY: Verify the caller's JWT before using the service role key
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const token = authHeader.substring(7)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data: { user }, error: authError } = await authClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { meeting_id, audio_url, language }: TranscribePayload = await req.json()

    if (!meeting_id || !audio_url) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update meeting status to processing
    await supabase
      .from('meetings')
      .update({ status: 'processing' })
      .eq('id', meeting_id)

    // Download audio from Supabase Storage
    const audioResponse = await fetch(audio_url, { signal: AbortSignal.timeout(30000) })
    if (!audioResponse.ok) {
      throw new Error('Failed to download audio file')
    }
    const audioBlob = await audioResponse.blob()
    const audioArrayBuffer = await audioBlob.arrayBuffer()

    // Transcribe with Whisper
    const formData = new FormData()
    formData.append('file', new File([audioArrayBuffer], 'audio.webm', { type: 'audio/webm' }))
    formData.append('model', 'whisper-1')
    if (language) {
      formData.append('language', language)
    }
    formData.append('response_format', 'text')

    const transcriptResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      signal: AbortSignal.timeout(60000),
      body: formData,
    })

    if (!transcriptResponse.ok) {
      const error = await transcriptResponse.text()
      throw new Error(`Whisper API error: ${error}`)
    }

    const transcript = await transcriptResponse.text()

    // Generate summary with GPT-4
    const summaryResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional meeting notes assistant. 
Generate a concise summary of the meeting transcript below.
Include:
1. Key discussion points
2. Decisions made
3. Action items with owners if mentioned
4. Any deadlines or follow-ups

Format the summary in clear sections with bullet points.`
          },
          {
            role: 'user',
            content: `Please summarize this meeting transcript:\n\n${transcript}`
          }
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    })

    if (!summaryResponse.ok) {
      const error = await summaryResponse.text()
      console.error('GPT API error:', error)
      // Continue without summary - not critical
    }

    let summary = ''
    try {
      const summaryData = await summaryResponse.json()
      summary = summaryData.choices?.[0]?.message?.content || 'Summary generation failed'
    } catch {
      summary = 'Summary not available'
    }

    // Estimate duration (if not available from audio metadata)
    const duration_seconds = Math.round(transcript.length / 5) // Rough estimate

    // Update meeting with transcript and summary
    await supabase
      .from('meetings')
      .update({
        transcript,
        summary,
        status: 'summarized',
      })
      .eq('id', meeting_id)

    const result: TranscribeResult = {
      meeting_id,
      transcript,
      summary,
      duration_seconds,
    }

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Transcription error:', error)

    // Try to update meeting status back to recorded
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseServiceKey)
      const { meeting_id } = await req.json()
      if (meeting_id) {
        await supabase
          .from('meetings')
          .update({ status: 'recorded' })
          .eq('id', meeting_id)
      }
    } catch {
      // Ignore cleanup errors
    }

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
