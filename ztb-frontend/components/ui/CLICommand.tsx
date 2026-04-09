'use client'

import { useState, useCallback } from 'react'

interface CLICommandProps {
  command: string
  label?: string
}

export function CLICommand({ command, label }: CLICommandProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* fallback noop */ }
  }, [command])

  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: 'rgba(11,14,20,0.95)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#F87171', opacity: 0.8, display: 'inline-block' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FBBF24', opacity: 0.8, display: 'inline-block' }} />
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ADE80', opacity: 0.8, display: 'inline-block' }} />
          {label && <span style={{ marginLeft: 6, color: 'var(--muted)', fontSize: '0.74rem', fontFamily: 'var(--font-mono)' }}>{label}</span>}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            fontSize: '0.75rem',
            fontWeight: 600,
            padding: '4px 10px',
            borderRadius: 7,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            background: copied ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
            border: copied ? '1px solid rgba(74,222,128,0.3)' : '1px solid rgba(255,255,255,0.1)',
            color: copied ? '#4ADE80' : 'var(--muted)',
          }}
        >
          {copied ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code body */}
      <div style={{ padding: '14px 18px', background: 'rgba(7,10,16,0.96)', overflowX: 'auto' }}>
        <pre style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: '0.78rem',
          lineHeight: 1.7,
          color: '#C9A853',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}>
          {command}
        </pre>
      </div>
    </div>
  )
}
