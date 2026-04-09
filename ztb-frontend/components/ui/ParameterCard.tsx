import { ReactNode } from 'react'

interface ParameterCardProps {
  label: string
  value: ReactNode
  ok?: boolean | 'warn' | null
  mono?: boolean
}

export function ParameterCard({ label, value, ok, mono }: ParameterCardProps) {
  const valColor =
    ok === true   ? '#4ADE80' :
    ok === 'warn' ? '#FBBF24' :
    ok === false  ? '#F87171' :
    'var(--muted-light)'

  const bg =
    ok === true   ? 'rgba(74,222,128,0.05)'  :
    ok === 'warn' ? 'rgba(251,191,36,0.05)'  :
    ok === false  ? 'rgba(248,113,113,0.05)' :
    'rgba(255,255,255,0.02)'

  const border =
    ok === true   ? 'rgba(74,222,128,0.15)'  :
    ok === 'warn' ? 'rgba(251,191,36,0.15)'  :
    ok === false  ? 'rgba(248,113,113,0.15)' :
    'rgba(255,255,255,0.05)'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      background: bg, border: `1px solid ${border}`,
      borderRadius: 10, padding: '10px 14px',
    }}>
      <span style={{ fontSize: '0.83rem', color: 'var(--muted)', fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: mono ? '0.72rem' : '0.83rem',
        fontWeight: 600,
        color: valColor,
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        textAlign: 'right',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {value}
      </span>
    </div>
  )
}

export function ParameterGrid({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }} className={className}>{children}</div>
}
