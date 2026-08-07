// ============================================
// Simple Canvas-based Charts
// No external dependencies
// ============================================

interface ChartData {
  label: string
  value: number
  color?: string
}

// Color palette
const COLORS = [
  '#6366F1', // Indigo
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#F97316', // Orange
  '#14B8A6', // Teal
  '#84CC16', // Lime
]

// ============================================
// Bar Chart Component
// ============================================

export function BarChart({ 
  data, 
  width = 400, 
  height = 200,
  showLabels = true,
  horizontal = false,
}: { 
  data: ChartData[]
  width?: number
  height?: number
  showLabels?: boolean
  horizontal?: boolean
}) {
  const canvasId = `bar-${Math.random().toString(36).slice(2)}`
  
  // Render on mount
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      renderBarChart(canvasId, data, width, height, showLabels, horizontal)
    }, 0)
  }

  return (
    <div className="relative" style={{ width, height }}>
      <canvas 
        id={canvasId}
        width={width * 2}
        height={height * 2}
        className="w-full h-full"
        style={{ width, height, imageRendering: 'crisp-edges' }}
      />
    </div>
  )
}

function renderBarChart(
  canvasId: string,
  data: ChartData[],
  width: number,
  height: number,
  showLabels: boolean,
  horizontal: boolean
) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = 2
  ctx.scale(dpr, dpr)
  
  const padding = showLabels ? { top: 20, right: 20, bottom: 40, left: 50 } : { top: 10, right: 10, bottom: 10, left: 10 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Clear
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  if (data.length === 0) return

  const maxValue = Math.max(...data.map(d => d.value))
  const barWidth = horizontal 
    ? chartHeight / data.length 
    : chartWidth / data.length
  const barGap = barWidth * 0.2

  ctx.font = '11px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (horizontal) {
    // Horizontal bars
    data.forEach((item, i) => {
      const y = padding.top + i * barWidth + barGap / 2
      const barHeight = (item.value / maxValue) * chartWidth
      const color = item.color || COLORS[i % COLORS.length]

      // Bar
      ctx.fillStyle = color
      ctx.fillRect(padding.left, y, barHeight, barWidth - barGap)

      // Label
      if (showLabels) {
        ctx.fillStyle = '#1e293b'
        ctx.textAlign = 'left'
        ctx.fillText(item.label, padding.left + barHeight + 5, y + (barWidth - barGap) / 2, 80)
        
        // Value
        ctx.textAlign = 'left'
        ctx.fillText(item.value.toLocaleString(), padding.left + barHeight + 85, y + (barWidth - barGap) / 2)
      }
    })
  } else {
    // Vertical bars
    data.forEach((item, i) => {
      const x = padding.left + i * barWidth + barGap / 2
      const barHeight = (item.value / maxValue) * chartHeight
      const color = item.color || COLORS[i % COLORS.length]

      // Bar
      ctx.fillStyle = color
      ctx.fillRect(x, padding.top + chartHeight - barHeight, barWidth - barGap, barHeight)

      // Label
      if (showLabels) {
        ctx.save()
        ctx.translate(x + (barWidth - barGap) / 2, height - padding.bottom + 15)
        ctx.rotate(-Math.PI / 4)
        ctx.fillStyle = '#1e293b'
        ctx.textAlign = 'right'
        ctx.fillText(item.label, 0, 0, 60)
        ctx.restore()

        // Value on top
        ctx.fillStyle = '#0f172a'
        ctx.textAlign = 'center'
        ctx.fillText(item.value.toLocaleString(), x + (barWidth - barGap) / 2, padding.top + chartHeight - barHeight - 8)
      }
    })
  }
}

// ============================================
// Line Chart Component
// ============================================

export function LineChart({ 
  data, 
  width = 500, 
  height = 200,
  showDots = true,
  fill = false,
}: { 
  data: { label: string; value: number }[]
  width?: number
  height?: number
  showDots?: boolean
  fill?: boolean
}) {
  const canvasId = `line-${Math.random().toString(36).slice(2)}`

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      renderLineChart(canvasId, data, width, height, showDots, fill)
    }, 0)
  }

  return (
    <div className="relative" style={{ width, height }}>
      <canvas 
        id={canvasId}
        width={width * 2}
        height={height * 2}
        className="w-full h-full"
        style={{ width, height, imageRendering: 'crisp-edges' }}
      />
    </div>
  )
}

function renderLineChart(
  canvasId: string,
  data: { label: string; value: number }[],
  width: number,
  height: number,
  showDots: boolean,
  fill: boolean
) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = 2
  ctx.scale(dpr, dpr)

  const padding = { top: 20, right: 20, bottom: 40, left: 50 }
  const chartWidth = width - padding.left - padding.right
  const chartHeight = height - padding.top - padding.bottom

  // Clear
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  if (data.length === 0) return

  const maxValue = Math.max(...data.map(d => d.value)) * 1.1
  const minValue = 0
  const range = maxValue - minValue

  // Draw grid lines
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = 1
  const gridLines = 5
  for (let i = 0; i <= gridLines; i++) {
    const y = padding.top + (chartHeight / gridLines) * i
    ctx.beginPath()
    ctx.moveTo(padding.left, y)
    ctx.lineTo(width - padding.right, y)
    ctx.stroke()

    // Y-axis labels
    const value = maxValue - (range / gridLines) * i
    ctx.fillStyle = '#334155'
    ctx.font = '10px system-ui, sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(Math.round(value).toLocaleString(), padding.left - 8, y + 4)
  }

  // Calculate points
  const points = data.map((item, i) => ({
    x: padding.left + (i / (data.length - 1 || 1)) * chartWidth,
    y: padding.top + (1 - (item.value - minValue) / range) * chartHeight,
    ...item,
  }))

  // Draw fill
  if (fill) {
    ctx.beginPath()
    ctx.moveTo(points[0].x, padding.top + chartHeight)
    points.forEach(p => ctx.lineTo(p.x, p.y))
    ctx.lineTo(points[points.length - 1].x, padding.top + chartHeight)
    ctx.closePath()
    
    const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight)
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)')
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)')
    ctx.fillStyle = gradient
    ctx.fill()
  }

  // Draw line
  ctx.beginPath()
  ctx.strokeStyle = '#6366F1'
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.stroke()

  // Draw dots
  if (showDots) {
    points.forEach(p => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      ctx.strokeStyle = '#6366F1'
      ctx.lineWidth = 2
      ctx.stroke()
    })
  }

  // X-axis labels
  ctx.fillStyle = '#334155'
  ctx.font = '10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  points.forEach((p, i) => {
    if (data.length <= 10 || i % Math.ceil(data.length / 10) === 0) {
      ctx.fillText(p.label, p.x, height - padding.bottom + 20, 50)
    }
  })
}

// ============================================
// Pie Chart Component
// ============================================

export function PieChart({ 
  data, 
  size = 200,
  showLegend = true,
}: { 
  data: ChartData[]
  size?: number
  showLegend?: boolean
}) {
  const canvasId = `pie-${Math.random().toString(36).slice(2)}`

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      renderPieChart(canvasId, data, size)
    }, 0)
  }

  const total = data.reduce((sum, d) => sum + d.value, 0)
  const legendWidth = showLegend ? 150 : 0

  return (
    <div className="flex items-center gap-4">
      <canvas 
        id={canvasId}
        width={size * 2}
        height={size * 2}
        style={{ width: size, height: size }}
      />
      {showLegend && (
        <div className="space-y-2" style={{ width: legendWidth }}>
          {data.map((item, i) => {
            const percentage = total > 0 ? ((item.value / total) * 100).toFixed(1) : '0'
            return (
              <div key={i} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-sm shrink-0" 
                  style={{ backgroundColor: item.color || COLORS[i % COLORS.length] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{item.label}</div>
                </div>
                <div className="text-xs text-black">{percentage}%</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function renderPieChart(canvasId: string, data: ChartData[], size: number) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = 2
  ctx.scale(dpr, dpr)

  const centerX = size / 2
  const centerY = size / 2
  const radius = Math.min(centerX, centerY) - 10

  // Clear
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  if (data.length === 0) return

  const total = data.reduce((sum, d) => sum + d.value, 0)
  let currentAngle = -Math.PI / 2

  data.forEach((item, i) => {
    const sliceAngle = (item.value / total) * Math.PI * 2
    const color = item.color || COLORS[i % COLORS.length]

    // Draw slice
    ctx.beginPath()
    ctx.moveTo(centerX, centerY)
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle)
    ctx.closePath()
    ctx.fillStyle = color
    ctx.fill()

    // Draw border
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.stroke()

    currentAngle += sliceAngle
  })

  // Draw center hole for donut effect
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius * 0.5, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Draw total in center
  ctx.fillStyle = '#0f172a'
  ctx.font = 'bold 16px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(total.toLocaleString(), centerX, centerY - 8)
  
  ctx.font = '11px system-ui, sans-serif'
  ctx.fillStyle = '#334155'
  ctx.fillText('Total', centerX, centerY + 12)
}

// ============================================
// Donut Chart Component
// ============================================

export function DonutChart({ 
  data, 
  size = 200,
  thickness = 30,
}: { 
  data: ChartData[]
  size?: number
  thickness?: number
}) {
  const canvasId = `donut-${Math.random().toString(36).slice(2)}`

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      renderDonutChart(canvasId, data, size, thickness)
    }, 0)
  }

  return (
    <canvas 
      id={canvasId}
      width={size * 2}
      height={size * 2}
      style={{ width: size, height: size }}
    />
  )
}

function renderDonutChart(canvasId: string, data: ChartData[], size: number, thickness: number) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = 2
  ctx.scale(dpr, dpr)

  const centerX = size / 2
  const centerY = size / 2
  const radius = Math.min(centerX, centerY) - thickness

  // Clear
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, size, size)

  if (data.length === 0) return

  const total = data.reduce((sum, d) => sum + d.value, 0)
  let currentAngle = -Math.PI / 2

  data.forEach((item, i) => {
    const sliceAngle = (item.value / total) * Math.PI * 2
    const color = item.color || COLORS[i % COLORS.length]

    // Draw arc
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle)
    ctx.strokeStyle = color
    ctx.lineWidth = thickness
    ctx.lineCap = 'round'
    ctx.stroke()

    currentAngle += sliceAngle
  })
}

// ============================================
// Sparkline Component
// ============================================

export function Sparkline({ 
  data, 
  width = 100, 
  height = 30,
  color = '#6366F1',
}: { 
  data: number[]
  width?: number
  height?: number
  color?: string
}) {
  const canvasId = `spark-${Math.random().toString(36).slice(2)}`

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      renderSparkline(canvasId, data, width, height, color)
    }, 0)
  }

  return (
    <canvas 
      id={canvasId}
      width={width * 2}
      height={height * 2}
      style={{ width, height }}
    />
  )
}

function renderSparkline(canvasId: string, data: number[], width: number, height: number, color: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = 2
  ctx.scale(dpr, dpr)

  // Clear
  ctx.fillStyle = 'transparent'
  ctx.clearRect(0, 0, width, height)

  if (data.length < 2) return

  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1

  const points = data.map((value, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((value - min) / range) * height,
  }))

  // Draw line
  ctx.beginPath()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y)
    else ctx.lineTo(p.x, p.y)
  })
  ctx.stroke()

  // Draw fill
  ctx.lineTo(points[points.length - 1].x, height)
  ctx.lineTo(points[0].x, height)
  ctx.closePath()
  ctx.fillStyle = color + '20'
  ctx.fill()
}

// ============================================
// Progress Ring Component
// ============================================

export function ProgressRing({ 
  progress, 
  size = 60,
  strokeWidth = 6,
  color = '#6366F1',
  label,
}: { 
  progress: number // 0-100
  size?: number
  strokeWidth?: number
  color?: string
  label?: string
}) {
  const canvasId = `ring-${Math.random().toString(36).slice(2)}`

  if (typeof window !== 'undefined') {
    setTimeout(() => {
      renderProgressRing(canvasId, progress, size, strokeWidth, color)
    }, 0)
  }

  return (
    <div className="relative inline-flex items-center justify-center">
      <canvas 
        id={canvasId}
        width={size * 2}
        height={size * 2}
        style={{ width: size, height: size, transform: 'rotate(-90deg)' }}
      />
      {label && (
        <span className="absolute text-xs font-medium">{label}</span>
      )}
    </div>
  )
}

function renderProgressRing(canvasId: string, progress: number, size: number, strokeWidth: number, color: string) {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement
  if (!canvas) return
  
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = 2
  ctx.scale(dpr, dpr)

  const centerX = size / 2
  const centerY = size / 2
  const radius = (size - strokeWidth) / 2
  const startAngle = 0
  const endAngle = (progress / 100) * Math.PI * 2

  // Background circle
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
  ctx.strokeStyle = '#cbd5e1'
  ctx.lineWidth = strokeWidth
  ctx.stroke()

  // Progress arc
  ctx.beginPath()
  ctx.arc(centerX, centerY, radius, startAngle, endAngle)
  ctx.strokeStyle = color
  ctx.lineWidth = strokeWidth
  ctx.lineCap = 'round'
  ctx.stroke()
}

export default {
  BarChart,
  LineChart,
  PieChart,
  DonutChart,
  Sparkline,
  ProgressRing,
}
