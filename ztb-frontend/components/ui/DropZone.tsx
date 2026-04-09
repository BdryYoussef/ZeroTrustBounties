'use client'

import { useRef, useState, useCallback, ReactNode } from 'react'

interface DropZoneProps {
  onFile: (file: File) => void
  accept?: string
  label?: string
  hint?: string
  file?: File | null
  error?: string
  successContent?: ReactNode
  className?: string
  disabled?: boolean
}

export function DropZone({
  onFile,
  accept,
  label = 'Drop file here',
  hint = 'or click to browse',
  file,
  error,
  successContent,
  className,
  disabled,
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const isSuccess = !!file && !error

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    if (disabled) return
    const dropped = e.dataTransfer.files[0]
    if (dropped) onFile(dropped)
  }, [onFile, disabled])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) setIsDragging(true)
  }, [disabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false)
  }, [])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    if (inputRef.current) inputRef.current.value = ''
  }, [onFile])

  const handleZoneClick = useCallback(() => {
    if (!disabled) inputRef.current?.click()
  }, [disabled])

  const borderColor = isDragging    ? '#C9A853'
    : isSuccess                     ? 'rgba(74,222,128,0.45)'
    : error                         ? 'rgba(248,113,113,0.4)'
    : 'rgba(255,255,255,0.12)'

  const bgColor = isDragging    ? 'rgba(201,168,83,0.05)'
    : isSuccess                 ? 'rgba(74,222,128,0.04)'
    : error                     ? 'rgba(248,113,113,0.04)'
    : 'rgba(255,255,255,0.02)'

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleZoneClick}
      onKeyDown={e => e.key === 'Enter' && handleZoneClick()}
      style={{
        position: 'relative',
        border: `2px dashed ${borderColor}`,
        borderRadius: 16,
        background: bgColor,
        padding: '28px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 200ms, background 200ms',
        textAlign: 'center',
        minHeight: 120,
        userSelect: 'none',
      }}
      className={className}
    >
      {/* Hidden real input */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', zIndex: -1 }}
        tabIndex={-1}
        aria-hidden="true"
      />

      {isSuccess ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {/* Checkmark icon — EXPLICIT SIZE */}
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(74,222,128,0.15)',
            border: '1px solid rgba(74,222,128,0.35)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5">
              <path strokeDasharray="50" strokeDashoffset="0" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"
                style={{ animation: 'checkDraw 350ms ease forwards' }} />
            </svg>
          </div>
          {successContent ?? (
            <>
              <div>
                <p style={{ color: '#4ADE80', fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>{file.name}</p>
                <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: '2px 0 0' }}>{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); inputRef.current?.click() }}
                style={{ fontSize: '0.75rem', color: 'var(--muted)', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Replace file
              </button>
            </>
          )}
        </div>
      ) : isDragging ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(201,168,83,0.15)', border: '1px solid rgba(201,168,83,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {/* Download arrow — EXPLICIT SIZE */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C9A853" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m-4-4l4 4 4-4" />
            </svg>
          </div>
          <p style={{ color: '#C9A853', fontWeight: 600, fontSize: '0.85rem', margin: 0 }}>Drop to upload</p>
        </div>
      ) : (
        <>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            {/* Upload icon — EXPLICIT SIZE, NO auto-expansion */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v8" />
            </svg>
          </div>
          <div>
            <p style={{ color: 'var(--text)', fontWeight: 500, fontSize: '0.85rem', margin: 0 }}>{label}</p>
            <p style={{ color: 'var(--muted)', fontSize: '0.75rem', margin: '3px 0 0' }}>{hint}</p>
          </div>
        </>
      )}

      {error && <p style={{ color: '#F87171', fontSize: '0.78rem', margin: '4px 0 0' }}>{error}</p>}
    </div>
  )
}
