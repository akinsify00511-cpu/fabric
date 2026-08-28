// Observer — single living snapshot of the whole business on mobile.
// Mirrors web ObserverView: attention exceptions first, domain tiles,
// risk strip, intelligence index rings, live activity.

import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native'
import { useAuth } from '../lib/AuthContext'
import { observerSnapshot, openExceptions, recentEvents } from '../lib/businessOS'
import { Card, SectionTitle, Loader, EmptyState, SeverityBadge } from './ui'
import { colors, spacing, fontSize } from '../theme'

export default function ObserverScreen() {
  const { staff } = useAuth()
  const [snap, setSnap] = useState<any>(null)
  const [exc, setExc] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    if (!staff) return
    const [s, e, ev] = await Promise.all([
      observerSnapshot(staff.business_id),
      openExceptions(staff.business_id),
      recentEvents(staff.business_id, 10),
    ])
    setSnap(s); setExc(e); setEvents(ev)
    setLoading(false); setRefreshing(false)
  }
  useEffect(() => { load() }, [staff?.business_id])

  if (loading) return <Loader />
  if (!snap) return <EmptyState text="No data yet. Your business snapshot will appear here as events arrive." />

  const critical = exc.filter((e: any) => e.severity === 'critical').length

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} />}
    >
      {/* Attention first */}
      <SectionTitle>Needs attention {exc.length > 0 && `· ${exc.length}${critical ? ` (${critical} critical)` : ''}`}</SectionTitle>
      {exc.length === 0 ? (
        <EmptyState text="Nothing requires attention right now." />
      ) : (
        exc.map((e: any) => (
          <Card key={e.id} style={styles.excCard}>
            <View style={styles.excHead}>
              <SeverityBadge severity={e.severity} />
              <Text style={styles.domain}>{e.domain}</Text>
            </View>
            <Text style={styles.excTitle}>{e.title}</Text>
            {e.detail ? <Text style={styles.excDetail}>{e.detail}</Text> : null}
            {e.suggested_action ? <Text style={styles.action}>→ {e.suggested_action}</Text> : null}
          </Card>
        ))
      )}

      {/* Domain tiles */}
      <SectionTitle>Business at a glance</SectionTitle>
      <View style={styles.tiles}>
        <Tile title="People" rows={[['Headcount', snap.people?.headcount ?? 0]]} />
        <Tile title="Money" rows={[
          ['Receivables', fmt(snap.money?.receivables)],
          ['Overdue', fmt(snap.money?.overdue_receivables)],
          ['Collected', fmt(snap.money?.invoices_paid)],
        ]} />
        <Tile title="Operations" rows={[
          ['Open tasks', snap.operations?.open_tasks ?? 0],
          ['Overdue', snap.operations?.overdue_tasks ?? 0],
        ]} />
        <Tile title="Inventory" rows={[['Low stock', snap.inventory?.low_stock_count ?? 0]]} />
      </View>

      {/* Live activity */}
      <SectionTitle>Live activity</SectionTitle>
      {events.length === 0 ? <EmptyState text="Business events will appear here." /> : (
        <Card>
          {events.map((e: any, i: number) => (
            <View key={e.id} style={[styles.eventRow, i > 0 && styles.eventBorder]}>
              <View style={styles.eventLeft}>
                <View style={styles.eventDot} />
                <Text style={styles.eventType}>{e.event_type}</Text>
              </View>
              <Text style={styles.eventTime}>{ago(e.occurred_at)}</Text>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  )
}

function Tile({ title, rows }: { title: string; rows: [string, any][] }) {
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileTitle}>{title}</Text>
      {rows.map(([l, v]) => (
        <View key={l} style={styles.tileRow}>
          <Text style={styles.tileLabel}>{l}</Text>
          <Text style={styles.tileValue}>{String(v)}</Text>
        </View>
      ))}
    </Card>
  )
}

function fmt(n: any): string {
  if (n == null) return '0'
  const v = Number(n)
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(0) + 'k'
  return String(v)
}
function ago(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.surface2 },
  container: { padding: spacing.lg, gap: spacing.sm },
  excCard: { gap: spacing.xs },
  excHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  domain: { fontSize: fontSize.xs, color: colors.textTertiary, textTransform: 'uppercase', fontWeight: '600' },
  excTitle: { fontSize: fontSize.md, fontWeight: '600', color: colors.text },
  excDetail: { fontSize: fontSize.sm, color: colors.textSecondary },
  action: { fontSize: fontSize.xs, color: colors.primary },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { flex: 1, minWidth: '45%' },
  tileTitle: { fontSize: fontSize.sm, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  tileRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  tileLabel: { fontSize: fontSize.xs, color: colors.textSecondary },
  tileValue: { fontSize: fontSize.xs, color: colors.text, fontWeight: '500' },
  eventRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  eventBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  eventLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eventDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  eventType: { fontSize: fontSize.sm, fontWeight: '500', color: colors.text },
  eventTime: { fontSize: fontSize.xs, color: colors.textTertiary },
})
