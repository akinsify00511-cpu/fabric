// Internal passkey helpers — all ceremonies go through the Avenize `webauthn`
// edge function (server-side verification). The browser WebAuthn API is used
// only to create/assert credentials; never to verify.

import { supabase } from './supabase'

export interface PasskeyCredential {
  id: string
  credential_id: string
  device_name: string | null
  backed_up: boolean
  transports: string[]
  last_used_at: string | null
  created_at: string
}

async function callWebauthn(action: string, payload: Record<string, unknown> = {}): Promise<any> {
  const { data, error } = await supabase.functions.invoke('webauthn', {
    body: { action, ...payload },
  })
  if (error) {
    const msg = (data as any)?.error || error.message
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export const passkeysSupported =
  typeof window !== 'undefined' &&
  typeof window.PublicKeyCredential !== 'undefined' &&
  typeof navigator.credentials !== 'undefined'

export async function registerPasskey(deviceName?: string): Promise<boolean> {
  const { startRegistration } = await import('@simplewebauthn/browser')
  const options = await callWebauthn('generate-registration-options')
  const response = await startRegistration({ optionsJSON: options })
  const result = await callWebauthn('verify-registration', { response, deviceName })
  return result?.verified === true
}

export async function loginWithPasskey(email?: string): Promise<boolean> {
  const { startAuthentication } = await import('@simplewebauthn/browser')
  const options = await callWebauthn('generate-authentication-options', { email })
  const response = await startAuthentication({ optionsJSON: options })
  const result = await callWebauthn('verify-authentication', { response })
  if (result?.verified !== true || !result.token_hash) return false
  const { error } = await supabase.auth.verifyOtp({
    token_hash: result.token_hash,
    type: 'magiclink',
  })
  return !error
}

export async function fetchMyPasskeys(): Promise<PasskeyCredential[]> {
  try {
    const { data, error } = await supabase
      .from('webauthn_credentials')
      .select('id, credential_id, device_name, backed_up, transports, last_used_at, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []) as PasskeyCredential[]
  } catch (e) {
    console.warn('[passkeys] fetch failed (migration may not be deployed):', e)
    return []
  }
}

export async function revokePasskey(credentialId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('revoke_my_passkey', {
      p_credential_id: credentialId,
    })
    if (error) throw error
    return data === true
  } catch (e) {
    console.error('[passkeys] revoke failed:', e)
    return false
  }
}
