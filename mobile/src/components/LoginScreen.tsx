import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { colors, spacing, radius, fontSize, shadows } from '../theme'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')

  async function submit() {
    if (!email || !password) return
    setLoading(true); setError(null)
    try {
      const { error } = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
    } catch (e: any) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Text style={styles.logoText}>A</Text>
        </View>
        <Text style={styles.title}>Avenize</Text>
        <Text style={styles.subtitle}>Your business operating system</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.formTitle}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</Text>
        <Text style={styles.formSubtitle}>{mode === 'signin' ? 'Sign in to continue to your workspace.' : 'Start running your business from one place.'}</Text>
        <TextInput style={styles.input} placeholder="Email" placeholderTextColor={colors.textTertiary} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <TextInput style={styles.input} placeholder="Password" placeholderTextColor={colors.textTertiary} value={password} onChangeText={setPassword} secureTextEntry />
        {error && <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View>}
        <TouchableOpacity style={styles.button} onPress={submit} disabled={loading} activeOpacity={0.85}>
          <Text style={styles.buttonText}>{loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          <Text style={styles.switchText}>{mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: spacing.lg, justifyContent: 'center' },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 64, height: 64, borderRadius: radius.lg, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', ...shadows.elevation2 },
  logoText: { color: colors.textOnPrimary, fontSize: 32, fontWeight: '700' },
  title: { fontSize: 30, fontWeight: '700', color: colors.text, marginTop: spacing.md, letterSpacing: -0.5 },
  subtitle: { fontSize: fontSize.sm, color: colors.textSecondary, marginTop: spacing.xs },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: spacing.xl, borderWidth: 1, borderColor: colors.border, ...shadows.elevation2 },
  formTitle: { fontSize: fontSize.xl, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  formSubtitle: { fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary, marginBottom: spacing.lg },
  form: { gap: spacing.md },
  input: { backgroundColor: colors.surface2, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontSize: fontSize.md, color: colors.text, borderWidth: 1, borderColor: colors.border },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md + 2, alignItems: 'center', marginTop: spacing.xs },
  buttonText: { color: colors.textOnPrimary, fontSize: fontSize.md, fontWeight: '700' },
  errorBox: { backgroundColor: colors.dangerSoft, borderRadius: radius.md, padding: spacing.sm, borderWidth: 1, borderColor: colors.danger },
  error: { color: colors.danger, fontSize: fontSize.sm },
  switchText: { color: colors.primary, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.lg, fontWeight: '600' },
})
