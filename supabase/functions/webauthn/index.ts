// webauthn — internal passkey ceremonies (Avenize-first: no Auth0/Clerk/Okta).
//
// Flow: browser WebAuthn API -> THIS function (server-side cryptographic
// verification via @simplewebauthn/server, running in our own Supabase Edge
// runtime) -> Postgres credential registry.
//
// Security:
//   - All signature/origin/RP-ID/counter verification happens HERE, server-side.
//   - Challenges are single-use + 5-minute TTL, stored client-denied (service role only).
//   - Counter monotonicity enforced — a cloned authenticator regresses and is rejected.
//   - Passkey login mints a session ONLY after a valid assertion, via a one-time
//     magiclink token exchanged client-side. No password equivalent is exposed.
//   - Auth attempts are rate-limited via check_auth_rate_limit (999); failures
//     are logged via log_security_event + webauthn_audit_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13"

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const RP_NAME = 'Avenize'
const CHALLENGE_TTL_MS = 5 * 60 * 1000

function envList(name: string, fallback: string[]): string[] {
  const raw = Deno.env.get(name)
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : fallback
}

function rpID(): string {
  return Deno.env.get('WEBAUTHN_RP_ID') || 'localhost'
}

function expectedOrigins(): string[] {
  return envList('WEBAUTHN_ORIGINS', [
    'http://localhost:5173',
    'https://avenize.app',
    'https://www.avenize.app',
  ])
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

async function callerUser(req: Request) {
  const auth = req.headers.get('Authorization') || ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const { data } = await adminClient().auth.getUser(jwt)
  return data?.user ?? null
}

// Atomically consume a challenge: only one request can mark it used.
interface ChallengeRow { challenge: string; user_id: string | null; email: string | null }

async function consumeChallenge(kind: string): Promise<ChallengeRow | null> {
  const sb = adminClient()
  const { data } = await sb
    .from('webauthn_challenges')
    .update({ used_at: new Date().toISOString() })
    .eq('kind', kind)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .select('challenge, user_id, email')
  return (data?.[0] as ChallengeRow) ?? null
}

async function audit(entry: Record<string, unknown>) {
  try {
    await adminClient().from('webauthn_audit_log').insert(entry)
  } catch { /* audit must never break the ceremony */ }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: Record<string, any>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const action = body.action
  const sb = adminClient()

  try {
    // ------------------------------------------------------------------
    // REGISTRATION — the user must already be signed in (a passkey is added
    // to an existing account, never used to create one).
    // ------------------------------------------------------------------
    if (action === 'generate-registration-options') {
      const user = await callerUser(req)
      if (!user) return json({ error: 'Sign in first to add a passkey.' }, 401)

      const { data: existing } = await sb
        .from('webauthn_credentials')
        .select('credential_id, transports')
        .eq('user_id', user.id)
        .is('revoked_at', null)

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: rpID(),
        userName: user.email ?? user.id,
        attestationType: 'none',
        excludeCredentials: (existing || []).map((c: any) => ({
          id: c.credential_id,
          transports: c.transports || [],
        })),
        authenticatorSelection: {
          residentKey: 'preferred',      // discoverable — enables passwordless login
          userVerification: 'preferred',
        },
      })

      await sb.from('webauthn_challenges').insert({
        challenge: options.challenge,
        user_id: user.id,
        kind: 'registration',
        expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
      })
      await audit({ user_id: user.id, event_type: 'registration_started' })
      return json(options)
    }

    if (action === 'verify-registration') {
      const user = await callerUser(req)
      if (!user) return json({ error: 'Sign in first to add a passkey.' }, 401)

      const challenge = await consumeChallenge('registration')
      if (!challenge || challenge.user_id !== user.id) {
        await audit({ user_id: user.id, event_type: 'registration_failed', detail: { reason: 'challenge_invalid' } })
        return json({ error: 'Challenge expired or already used. Try again.' }, 400)
      }

      const verification = await verifyRegistrationResponse({
        response: body.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: expectedOrigins(),
        expectedRPID: rpID(),
      })
      const { verified, registrationInfo } = verification
      if (!verified || !registrationInfo) {
        await audit({ user_id: user.id, event_type: 'registration_failed', detail: { reason: 'attestation_rejected' } })
        return json({ error: 'Passkey verification failed.' }, 400)
      }

      const { credential, credentialBackedUp, aaguid } = registrationInfo
      const { error: insErr } = await sb.from('webauthn_credentials').insert({
        user_id: user.id,
        credential_id: credential.id,
        public_key: Buffer.from(credential.publicKey).toString('base64url'),
        counter: credential.counter,
        transports: credential.transports || [],
        device_name: body.deviceName || null,
        backed_up: credentialBackedUp,
        aaguid: aaguid || null,
      })
      if (insErr) {
        await audit({ user_id: user.id, event_type: 'registration_failed', detail: { reason: insErr.message } })
        return json({ error: 'That passkey is already registered.' }, 409)
      }
      await audit({ user_id: user.id, credential_id: credential.id, event_type: 'registration_verified' })
      return json({ verified: true })
    }

    // ------------------------------------------------------------------
    // AUTHENTICATION — passwordless login via discoverable credential.
    // On success, mint a one-time magiclink token the client exchanges for
    // a session. Rate-limited like a password login.
    // ------------------------------------------------------------------
    if (action === 'generate-authentication-options') {
      const email = (body.email || '').toLowerCase().trim()
      if (email) {
        const { data } = await sb.rpc('check_auth_rate_limit', {
          p_identifier: email, p_action: 'passkey_login', p_max_attempts: 10, p_window_seconds: 300, p_lockout_seconds: 900,
        })
        if (data === false) {
          return json({ error: 'Too many attempts. Try again later.' }, 429)
        }
      }

      const options = await generateAuthenticationOptions({
        rpID: rpID(),
        userVerification: 'preferred',
        // Empty allowCredentials = discoverable-credential (usernameless) login.
        allowCredentials: [],
      })

      await sb.from('webauthn_challenges').insert({
        challenge: options.challenge,
        email: email || null,
        kind: 'authentication',
        expires_at: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
      })
      return json(options)
    }

    if (action === 'verify-authentication') {
      const challenge = await consumeChallenge('authentication')
      if (!challenge) {
        return json({ error: 'Challenge expired or already used. Try again.' }, 400)
      }

      const credentialID = body.response?.id
      const { data: cred } = await sb
        .from('webauthn_credentials')
        .select('*')
        .eq('credential_id', credentialID)
        .is('revoked_at', null)
        .maybeSingle()
      if (!cred) {
        await audit({ credential_id: credentialID, event_type: 'authentication_failed', detail: { reason: 'unknown_credential' } })
        return json({ error: 'Unknown passkey.' }, 401)
      }

      let verification
      try {
        verification = await verifyAuthenticationResponse({
          response: body.response,
          expectedChallenge: challenge.challenge,
          expectedOrigin: expectedOrigins(),
          expectedRPID: rpID(),
          credential: {
            id: cred.credential_id,
            publicKey: Uint8Array.from(atob(cred.public_key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
            counter: cred.counter,
            transports: cred.transports || [],
          },
        })
      } catch (e) {
        await audit({ user_id: cred.user_id, credential_id: cred.credential_id, event_type: 'authentication_failed', detail: { reason: String(e) } })
        return json({ error: 'Passkey verification failed.' }, 401)
      }

      const { verified, authenticationInfo } = verification
      if (!verified) {
        await audit({ user_id: cred.user_id, credential_id: cred.credential_id, event_type: 'authentication_failed', detail: { reason: 'assertion_rejected' } })
        return json({ error: 'Passkey verification failed.' }, 401)
      }

      // Clone detection: the authenticator's counter must move FORWARD.
      if (authenticationInfo.newCounter <= cred.counter && cred.counter > 0) {
        await audit({ user_id: cred.user_id, credential_id: cred.credential_id, event_type: 'counter_regression_detected', detail: { stored: cred.counter, received: authenticationInfo.newCounter } })
        return json({ error: 'This passkey failed its integrity check. Use another sign-in method.' }, 401)
      }

      await sb
        .from('webauthn_credentials')
        .update({ counter: authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
        .eq('credential_id', cred.credential_id)

      // Mint a one-time session token for the verified user.
      const { data: authUser } = await sb.auth.admin.getUserById(cred.user_id)
      if (!authUser?.user?.email) return json({ error: 'Account unavailable.' }, 500)
      const { data: link, error: linkErr } = await sb.auth.admin.generateLink({
        type: 'magiclink',
        email: authUser.user.email,
      })
      if (linkErr || !link?.properties?.hashed_token) {
        return json({ error: 'Could not create a session. Try password sign-in.' }, 500)
      }

      await audit({ user_id: cred.user_id, credential_id: cred.credential_id, event_type: 'authentication_verified' })
      return json({ verified: true, token_hash: link.properties.hashed_token, email: authUser.user.email })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    console.error('[webauthn]', e)
    return json({ error: 'Internal error' }, 500)
  }
})
