import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!serviceKey) return new Response(JSON.stringify({ error: "Server configuration incomplete" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const admin = createClient(url, serviceKey);
  const auth = req.headers.get("Authorization");
  if (!auth) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const body = await req.json().catch(() => null);
  const captureId = body?.capture_id;
  if (!captureId) return new Response(JSON.stringify({ error: "capture_id is required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  const { data: capture, error: captureError } = await admin
    .from("meeting_captures")
    .select("id, meeting_id, business_id, staff_id, capture_type, storage_path, mime_type, size_bytes, duration_seconds")
    .eq("id", captureId)
    .maybeSingle();
  if (captureError || !capture) return new Response(JSON.stringify({ error: "Capture not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

  const { data: staff } = await admin.from("staff").select("id").eq("id", capture.staff_id).eq("user_id", user.id).eq("business_id", capture.business_id).maybeSingle();
  if (!staff) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

  // This worker deliberately establishes the durable media record first. Transcription
  // is provider-specific and must not be faked when no transcription provider is configured.
  const { data: existing } = await admin.from("meeting_media").select("id").eq("meeting_id", capture.meeting_id).eq("storage_path", capture.storage_path).maybeSingle();
  let mediaId = existing?.id;
  if (!mediaId) {
    const { data: media, error } = await admin.from("meeting_media").insert({
      meeting_id: capture.meeting_id,
      media_type: capture.capture_type === "voice" || capture.mime_type?.startsWith("audio/") || capture.mime_type === "video/webm" ? "audio" : capture.capture_type,
      storage_path: capture.storage_path,
      duration_seconds: capture.duration_seconds,
      size_bytes: capture.size_bytes,
      processing_status: "pending",
    }).select("id").single();
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    mediaId = media.id;
  }

  return new Response(JSON.stringify({ ok: true, capture_id: capture.id, media_id: mediaId, processing_status: "pending" }), { headers: { ...cors, "Content-Type": "application/json" } });
});
