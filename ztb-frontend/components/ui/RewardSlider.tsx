'use client'

import { useId } from 'react'

interface RewardSliderProps {
  value: string
  onChange: (val: string) => void
  min?: number
  max?: number
  step?: number
  floorValue?: string
  floorLabel?: string
  currency?: string
  disabled?: boolean
}

export function RewardSlider({
  value,
  onChange,
  min = 100,
  max = 100000,
  step = 100,
  floorValue,
  floorLabel,
  currency = 'USDT',
  disabled,
}: RewardSliderProps) {
  const id   = useId()
  const num  = parseFloat(value) || 0
  const pct  = Math.max(0, Math.min(100, ((num - min) / (max - min)) * 100))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Value display */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 4 }}>
            Total Reward
          </p>
          <p style={{
            fontFamily: 'var(--font-title)',
            fontSize: '2rem',
            fontWeight: 800,
            letterSpacing: '-0.04em',
            margin: 0,
            background: 'linear-gradient(135deg,#C9A853,#E2C46A)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}>
            {num > 0 ? num.toLocaleString() : '—'}
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--muted)', marginLeft: 6 }}>{currency}</span>
          </p>
        </div>
        {floorValue && (
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)', marginBottom: 4 }}>
              {floorLabel || 'Floor (70%)'}
            </p>
            <p style={{ fontFamily: 'var(--font-title)', fontSize: '1.2rem', fontWeight: 800, color: '#5FA8D3', margin: 0, letterSpacing: '-0.03em' }}>
              {parseFloat(floorValue).toLocaleString()}
              <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 5 }}>{currency}</span>
            </p>
          </div>
        )}
      </div>

      {/* Slider track */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ position: 'relative', height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.07)' }}>
          {/* Fill */}
          <div style={{
            position: 'absolute', left: 0, top: 0,
            height: '100%', borderRadius: 999,
            width: `${pct}%`,
            background: 'linear-gradient(90deg, #1B4F72, #C9A853)',
            transition: 'width 100ms ease',
          }} />
          {/* Custom thumb */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: `${pct}%`,
            transform: 'translate(-50%, -50%)',
            width: 18, height: 18,
            borderRadius: '50%',
            border: '2px solid #C9A853',
            background: '#0B0E14',
            boxShadow: '0 0 10px rgba(201,168,83,0.4)',
            pointerEvents: 'none',
            transition: 'left 100ms ease',
            zIndex: 1,
          }} />
          {/* Invisible real input on top */}
          <input
            id={id}
            type="range"
            min={min} max={max} step={step}
            value={num || min}
            disabled={disabled}
            onChange={e => onChange(e.target.value)}
            style={{
              position: 'absolute', inset: 0,
              width: '100%', height: '100%',
              opacity: 0, cursor: 'pointer', zIndex: 2,
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--muted)' }}>
          <span>{min.toLocaleString()} {currency}</span>
          <span>{max.toLocaleString()} {currency}</span>
        </div>
      </div>

      {/* Manual input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="number"
          min={min} max={max} step={step}
          value={value}
          placeholder={`e.g. ${(min * 10).toLocaleString()}`}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          style={{
            width: 160, padding: '8px 12px',
            background: 'var(--surface-2)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10,
            color: '#C9A853',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            outline: 'none',
          }}
        />
        <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{currency}</span>
        <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>or type amount</span>
      </div>
    </div>
  )
}
