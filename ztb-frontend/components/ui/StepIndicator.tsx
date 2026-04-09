import { ReactNode } from 'react'

interface StepHeaderProps {
  n: number
  title: string
  subtitle?: string
  done?: boolean
  active?: boolean
  action?: ReactNode
}

export function StepHeader({ n, title, subtitle, done, active, action }: StepHeaderProps) {
  const dotBg     = done ? 'rgba(74,222,128,0.18)'  : active ? 'rgba(201,168,83,0.18)'  : 'rgba(255,255,255,0.06)'
  const dotBorder = done ? 'rgba(74,222,128,0.4)'   : active ? 'rgba(201,168,83,0.4)'   : 'rgba(255,255,255,0.1)'
  const dotColor  = done ? '#4ADE80'                : active ? '#C9A853'                : 'var(--muted)'
  const titleColor = done ? '#4ADE80' : active ? '#C9A853' : 'var(--text)'

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Step number dot */}
        <div style={{
          width: 28, height: 28,
          borderRadius: '50%',
          background: dotBg,
          border: `1px solid ${dotBorder}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginTop: 1,
        }}>
          {done ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={dotColor} strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"
                style={{ strokeDasharray: 50, animation: 'checkDraw 350ms ease forwards' }} />
            </svg>
          ) : (
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: dotColor }}>{n}</span>
          )}
        </div>
        <div>
          <p style={{ fontFamily: 'var(--font-ui)', fontWeight: 600, fontSize: '0.9rem', color: titleColor, margin: 0, lineHeight: 1.3 }}>
            {title}
          </p>
          {subtitle && (
            <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: '3px 0 0', lineHeight: 1.5 }}>{subtitle}</p>
          )}
        </div>
      </div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

// Vertical step indicator (for sidebar use)
interface StepIndicatorProps {
  steps: Array<{ label: string; description?: string }>
  current: number
  completed: number
}

export function StepIndicator({ steps, current, completed }: StepIndicatorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {steps.map((step, i) => {
        const isDone   = i < completed
        const isActive = i === current
        const dotBg     = isDone ? 'rgba(74,222,128,0.18)' : isActive ? 'rgba(201,168,83,0.18)' : 'rgba(255,255,255,0.06)'
        const dotBorder = isDone ? 'rgba(74,222,128,0.4)'  : isActive ? 'rgba(201,168,83,0.4)'  : 'rgba(255,255,255,0.1)'
        const dotColor  = isDone ? '#4ADE80' : isActive ? '#C9A853' : 'var(--muted)'
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                background: dotBg, border: `1px solid ${dotBorder}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {isDone ? (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={dotColor} strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span style={{ fontSize: '0.68rem', fontWeight: 800, color: dotColor }}>{i + 1}</span>
                )}
              </div>
              {i < steps.length - 1 && (
                <div style={{
                  width: 1, minHeight: 22, marginTop: 2, marginBottom: 2,
                  background: isDone ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.06)',
                }} />
              )}
            </div>
            <div style={{ paddingBottom: i < steps.length - 1 ? 14 : 0, paddingTop: 2 }}>
              <p style={{ fontSize: '0.82rem', fontWeight: 600, color: isDone ? '#4ADE80' : isActive ? '#C9A853' : 'var(--muted)', margin: 0 }}>
                {step.label}
              </p>
              {step.description && (
                <p style={{ fontSize: '0.72rem', color: 'var(--muted)', margin: '2px 0 0' }}>{step.description}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
