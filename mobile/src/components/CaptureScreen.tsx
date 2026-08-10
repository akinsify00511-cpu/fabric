// AI Capture — the flagship "Tell Avenize what happened" screen. Mirrors
// the web AICapture page: natural-language capture → "What I Understood"
// confirmation → raise a business event. Designed for mobile-first input.

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useAuth } from '../lib/AuthContext'
import { parseIntent, raiseEvent } from '../lib/businessOS'
import { Card, SectionTitle, Loader } from './ui'
import { colors, spacing, radius, fontSize } from '../theme'

export default function CaptureScreen() {
  const { staff } = useAuth()
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function understand() {
    if (!text.trim() || !staff) return
    setLoading(true); setParsed(null); setConfirmed(false)
    try {
      const result = await parseIntent(text, staff.business_id)
      setParsed(result)
    } catch (e) { console.warn(e) } finally { setLoading(false) }
  }

  async function confirm() {
    if (!parsed || !staff) return
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    await raiseEvent({
      business_id: staff.business_id,
      event_type: parsed.event_type || 'UserCapture',
      entity_type: parsed.entities?.[0]?.type || 'unknown',
      entity_id: parsed.entities?.[0]?.id,
      payload: { text, understood: parsed, source: 'mobile' },
      source: 'mobile-capture',
    })
    setConfirmed(true)
    setText(''); setParsed(null)
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>Tell Avenize what happened in your own words.</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. I paid the salaries for July, 2.4 million naira"
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          multiline
          textAlignVertical="top"
        />
        <TouchableOpacity style={styles.button} onPress={understand} disabled={loading || !text.trim()}>
          <Text style={styles.buttonText}>{loading ? 'Understanding…' : 'Understand'}</Text>
        </TouchableOpacity>

        {loading && <Loader />}

        {parsed && !confirmed && (
          <View style={styles.understood}>
            <SectionTitle>What I understood</SectionTitle>
            <Card>
              <Row label="Event" value={parsed.event_type || '—'} />
              <Row label="Confidence" value={`${Math.round((parsed.confidence ?? 0) * 100)}%`} />
              {parsed.entities?.map((e: any, i: number) => (
                <Row key={i} label={e.type} value={e.name || e.id || '—'} />
              ))}
              {parsed.destinations?.length > 0 && (
                <Row label="Updates" value={parsed.destinations.map((d: any) => d.table).join(', ')} />
              )}
            </Card>
            {parsed.requires_confirmation && (
              <Text style={styles.warn}>This will update your records. Confirm to proceed.</Text>
            )}
            <TouchableOpacity style={[styles.button, { backgroundColor: colors.success }]} onPress={confirm}>
              <Text style={styles.buttonText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        )}
        {confirmed && <Text style={styles.done}>✓ Recorded. Avenize is updating.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: spacing.lg, gap: spacing.md },
  hint: { color: colors.textSecondary, fontSize: fontSize.sm },
  input: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg, fontSize: fontSize.md, color: colors.text, minHeight: 100, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' },
  button: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: fontSize.md, fontWeight: '600' },
  understood: { gap: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  rowLabel: { color: colors.textSecondary, fontSize: fontSize.sm },
  rowValue: { color: colors.text, fontSize: fontSize.sm, fontWeight: '500' },
  warn: { color: colors.warning, fontSize: fontSize.xs },
  done: { color: colors.success, fontSize: fontSize.sm, textAlign: 'center', marginTop: spacing.md },
})
