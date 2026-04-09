import { CSSProperties, ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padding?: boolean
  glow?: 'gold' | 'blue' | 'none'
  hover?: boolean
  style?: CSSProperties
}

export function Card({ children, className, padding = true, glow = 'none', hover = true, style }: CardProps) {
  const base: CSSProperties = {
    background: 'var(--surface)',
    border: glow === 'gold'
      ? '1px solid rgba(201,168,83,0.35)'
      : glow === 'blue'
      ? '1px solid rgba(95,168,211,0.35)'
      : '1px solid rgba(255,255,255,0.07)',
    borderRadius: 18,
    padding: padding ? '22px 24px' : 0,
    boxShadow: glow === 'gold'
      ? '0 0 20px rgba(201,168,83,0.18), 0 4px 24px rgba(0,0,0,0.35)'
      : '0 4px 24px rgba(0,0,0,0.35)',
    backdropFilter: 'blur(6px)',
    transition: hover ? 'border-color 250ms ease, box-shadow 250ms ease, transform 200ms ease' : 'none',
    ...style,
  }

  function handleMouseEnter(e: React.MouseEvent<HTMLDivElement>) {
    if (!hover) return
    const el = e.currentTarget
    el.style.borderColor = 'rgba(201,168,83,0.25)'
    el.style.boxShadow = '0 8px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(201,168,83,0.18)'
    el.style.transform = 'translateY(-1px)'
  }
  function handleMouseLeave(e: React.MouseEvent<HTMLDivElement>) {
    if (!hover) return
    const el = e.currentTarget
    el.style.borderColor = glow === 'gold' ? 'rgba(201,168,83,0.35)' : 'rgba(255,255,255,0.07)'
    el.style.boxShadow = glow === 'gold' ? '0 0 20px rgba(201,168,83,0.18), 0 4px 24px rgba(0,0,0,0.35)' : '0 4px 24px rgba(0,0,0,0.35)'
    el.style.transform = 'none'
  }

  return (
    <div
      style={base}
      className={className}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
      <div>{children}</div>
      {action && <div style={{ flexShrink: 0 }}>{action}</div>}
    </div>
  )
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h3 style={{ fontFamily: 'var(--font-title)', fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.02em', lineHeight: 1.2, margin: 0 }}>
      {children}
    </h3>
  )
}

export function CardDescription({ children }: { children: ReactNode }) {
  return <p style={{ color: 'var(--muted)', fontSize: '0.88rem', marginTop: 4, lineHeight: 1.6 }}>{children}</p>
}

export function CardDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '18px 0' }} />
}
