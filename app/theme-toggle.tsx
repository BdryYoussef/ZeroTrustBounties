'use client'

import { useEffect, useState } from 'react'

type ThemeName = 'fintech-dark' | 'executive-light'

const THEME_STORAGE_KEY = 'ztb-theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>('fintech-dark')

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemeName | null
    if (saved === 'fintech-dark' || saved === 'executive-light') {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
      return
    }
    document.documentElement.setAttribute('data-theme', 'fintech-dark')
  }, [])

  function applyTheme(nextTheme: ThemeName) {
    setTheme(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
  }

  return (
    <div className="theme-switch" aria-label="Theme selector">
      <button
        type="button"
        className={`theme-pill ${theme === 'fintech-dark' ? 'active' : ''}`}
        onClick={() => applyTheme('fintech-dark')}
      >
        Fintech Dark
      </button>
      <button
        type="button"
        className={`theme-pill ${theme === 'executive-light' ? 'active' : ''}`}
        onClick={() => applyTheme('executive-light')}
      >
        Executive Light
      </button>
    </div>
  )
}
