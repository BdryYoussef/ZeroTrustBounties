'use client'

import React, { useEffect, useRef } from 'react'

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number

    // Parallax mouse configuration
    const mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 }

    const initCanvas = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initParticles()
    }

    class Particle {
      x: number
      y: number
      vx: number
      vy: number
      radius: number
      baseX: number
      baseY: number

      constructor(x: number, y: number) {
        this.x = x
        this.y = y
        this.baseX = x
        this.baseY = y
        this.vx = (Math.random() - 0.5) * 0.4
        this.vy = (Math.random() - 0.5) * 0.4
        this.radius = Math.random() * 1.5 + 0.5 // small nodes
      }

      update() {
        this.x += this.vx
        this.y += this.vy

        // Parallax effect towards mouse
        const dx = mouse.x - this.x
        const dy = mouse.y - this.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        // Very subtle magnetic pull on cursor
        if (distance < 200) {
          const forceDirectionX = dx / distance
          const forceDirectionY = dy / distance
          const force = (200 - distance) / 200
          
          this.x -= forceDirectionX * force * 0.5
          this.y -= forceDirectionY * force * 0.5
        }

        // Bounce off edges smoothly
        if (this.x < 0 || this.x > canvas.width) this.vx *= -1
        if (this.y < 0 || this.y > canvas.height) this.vy *= -1
      }

      draw() {
        if (!ctx) return
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        // Light blue/cyan node glowing color
        ctx.fillStyle = 'rgba(95, 168, 211, 0.4)'
        ctx.fill()
      }
    }

    let particles: Particle[] = []

    const initParticles = () => {
      particles = []
      // Adjust density based on screen size (keeps it lightweight)
      const density = window.innerWidth < 768 ? 25000 : 15000
      const numberOfParticles = Math.floor((canvas.width * canvas.height) / density)
      for (let i = 0; i < numberOfParticles; i++) {
        const x = Math.random() * canvas.width
        const y = Math.random() * canvas.height
        particles.push(new Particle(x, y))
      }
    }

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      for (let i = 0; i < particles.length; i++) {
        particles[i].update()
        particles[i].draw()
        
        for (let j = i; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const distance = Math.sqrt(dx * dx + dy * dy)
          
          // Connect nodes if close together
          if (distance < 130) {
            ctx.beginPath()
            // Dynamic opacity based on proximity
            const opacity = 1 - (distance / 130)
            
            // Subtle blue/gold mixture lines
            ctx.strokeStyle = `rgba(95, 168, 211, ${opacity * 0.15})`
            ctx.lineWidth = 1
            ctx.moveTo(particles[i].x, particles[i].y)
            ctx.lineTo(particles[j].x, particles[j].y)
            ctx.stroke()
          }
        }
      }
      animationFrameId = requestAnimationFrame(animate)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouse.x = e.clientX
      mouse.y = e.clientY
    }

    // Initialize
    initCanvas()
    animate()

    // Listeners
    window.addEventListener('resize', initCanvas)
    window.addEventListener('mousemove', onMouseMove)

    return () => {
      window.removeEventListener('resize', initCanvas)
      window.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: -1, // Keep behind all content
        opacity: 0.65, // Soft overlay on the grid
        animation: 'fadeIn 2.5s ease-in-out'
      }}
    />
  )
}
