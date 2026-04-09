import { ReactNode } from 'react'

type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'gold' | 'subtle'

const STYLES: Record<BadgeVariant, React.CSSProperties> = {
  success: { background: 'rgba(74,222,128,0.10)',  border: '1px solid rgba(74,222,128,0.28)',  color: '#4ADE80' },
  error:   { background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.28)', color: '#F87171' },
  warning: { background: 'rgba(251,191,36,0.10)',  border: '1px solid rgba(251,191,36,0.28)',  color: '#FBBF24' },
  info:    { background: 'rgba(95,168,211,0.10)',  border: '1px solid rgba(95,168,211,0.28)',  color: '#5FA8D3' },
  gold:    { background: 'rgba(201,168,83,0.10)',  border: '1px solid rgba(201,168,83,0.28)',  color: '#C9A853' },
  subtle:  { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',  color: 'var(--muted-light)' },
}

interface BadgeProps {
  variant?: BadgeVariant
  children: ReactNode
  className?: string
  dot?: boolean
  style?: React.CSSProperties
}

export function Badge({ variant = 'subtle', children, className, dot, style }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 10px',
        borderRadius: 999,
        fontSize: '0.73rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
        ...STYLES[variant],
        ...style,
      }}
      className={className}
    >
      {dot && (
        <span style={{
          display: 'inline-block',
          width: 5, height: 5,
          borderRadius: '50%',
          background: STYLES[variant].color as string,
          flexShrink: 0,
        }} />
      )}
      {children}
    </span>
  )
}
