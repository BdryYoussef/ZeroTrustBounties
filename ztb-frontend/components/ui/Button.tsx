'use client'

import { ButtonHTMLAttributes, ReactNode, useRef } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  isLoading?: boolean
}

const VARIANT_STYLE: Record<string, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(135deg, #BF9940 0%, #C9A853 40%, #E2C46A 100%)',
    color: '#0B0E14',
    fontWeight: 700,
    border: 'none',
    boxShadow: '0 4px 16px rgba(201,168,83,0.3)',
  },
  secondary: {
    background: 'var(--surface-2)',
    color: 'var(--text)',
    border: '1px solid rgba(255,255,255,0.08)',
    fontWeight: 600,
  },
  danger: {
    background: 'rgba(248,113,113,0.1)',
    color: '#F87171',
    border: '1px solid rgba(248,113,113,0.28)',
    fontWeight: 600,
  },
  ghost: {
    background: 'transparent',
    color: 'var(--muted)',
    border: '1px solid transparent',
    fontWeight: 500,
  },
}

const SIZE_STYLE: Record<string, React.CSSProperties> = {
  sm: { padding: '6px 12px', fontSize: '0.8rem', borderRadius: 9 },
  md: { padding: '10px 18px', fontSize: '0.88rem', borderRadius: 12 },
  lg: { padding: '13px 24px', fontSize: '0.96rem', borderRadius: 14 },
}

export function Button({ variant = 'secondary', size = 'md', children, isLoading, onClick, style, ...props }: ButtonProps) {
  const ref = useRef<HTMLButtonElement>(null)

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = ref.current
    if (btn) {
      const ripple = document.createElement('span')
      const rect   = btn.getBoundingClientRect()
      const sz     = Math.max(rect.width, rect.height)
      ripple.style.cssText = `position:absolute;width:${sz}px;height:${sz}px;left:${e.clientX - rect.left - sz/2}px;top:${e.clientY - rect.top - sz/2}px;border-radius:50%;background:rgba(255,255,255,0.2);pointer-events:none;animation:ripple 550ms ease forwards;z-index:0;`
      btn.appendChild(ripple)
      setTimeout(() => ripple.remove(), 600)
    }
    onClick?.(e)
  }

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    fontFamily: 'var(--font-ui)',
    letterSpacing: '0.01em',
    cursor: 'pointer',
    position: 'relative',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'transform 180ms ease, opacity 180ms ease, box-shadow 200ms ease',
    opacity: (isLoading || props.disabled) ? 0.45 : 1,
    ...VARIANT_STYLE[variant],
    ...SIZE_STYLE[size],
    ...style,
  }

  return (
    <button
      ref={ref}
      style={baseStyle}
      onClick={handleClick}
      disabled={isLoading || props.disabled}
      onMouseEnter={e => { if (!props.disabled && !isLoading) (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'none' }}
      {...props}
    >
      {isLoading ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity=".2" />
            <path fill="currentColor" opacity=".8" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Processing…
        </span>
      ) : children}
    </button>
  )
}
