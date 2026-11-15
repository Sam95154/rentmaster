import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Mouse-driven 3D tilt. Spread the returned props on the element; give it className "tilt". */
export function useTilt<T extends HTMLElement>(max = 10, rest = '') {
  const ref = useRef<T>(null)
  return {
    ref,
    onMouseMove: (e: MouseEvent<T>) => {
      const el = ref.current
      if (!el || reducedMotion()) return
      const r = el.getBoundingClientRect()
      const px = (e.clientX - r.left) / r.width - 0.5
      const py = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg)`
    },
    onMouseLeave: () => { if (ref.current) ref.current.style.transform = rest },
  }
}

/** Fades content in once, when it scrolls into view. */
export function Reveal({ children, className, delay = 0, style }: { children: ReactNode; className?: string; delay?: number; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') { setSeen(true); return }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect() } }, { threshold: 0.15 })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return <div ref={ref} className={cn('reveal', seen && 'is-in', className)} style={{ transitionDelay: `${delay}ms`, ...style }}>{children}</div>
}
