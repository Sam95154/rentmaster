import { useState, type CSSProperties, type MouseEvent } from 'react'
import { cn } from '@/lib/utils'

interface BoxProps { w: number; d: number; h: number; y: number; front: string; side: string; top: string; windows?: boolean; lit?: string }

/** One cuboid built from CSS 3D faces. y is the height of its base above the ground. */
function Box({ w, d, h, y, front, side, top, windows = true, lit = '#FFE7A3' }: BoxProps) {
  const face = (extra: CSSProperties, bg: string, cols: number, key: string, seed: number) => (
    <div key={key} className="absolute grid gap-2 p-2.5" style={{ background: bg, gridTemplateColumns: `repeat(${cols}, 1fr)`, ...extra }}>
      {windows && Array.from({ length: cols }).map((_, i) => (
        <span key={i} className="animate-twinkle rounded-[3px]" style={{ background: lit, animationDelay: `${((i * 7 + seed * 3) % 11) * 0.45}s`, opacity: (i + seed) % 4 === 0 ? 0.25 : 1 }} />
      ))}
    </div>
  )
  const fc = Math.max(2, Math.floor(w / 42)); const sc = Math.max(2, Math.floor(d / 42))
  return (
    <div className="absolute left-1/2 top-1/2" style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform: `translateY(${-(y + h / 2)}px)`, transformStyle: 'preserve-3d' }}>
      {face({ width: w, height: h, transform: `translateZ(${d / 2}px)` }, front, fc, 'f', 1)}
      {face({ width: w, height: h, transform: `rotateY(180deg) translateZ(${d / 2}px)` }, front, fc, 'b', 2)}
      {face({ width: d, height: h, left: (w - d) / 2, transform: `rotateY(90deg) translateZ(${w / 2}px)` }, side, sc, 'r', 3)}
      {face({ width: d, height: h, left: (w - d) / 2, transform: `rotateY(-90deg) translateZ(${w / 2}px)` }, side, sc, 'l', 4)}
      <div className="absolute" style={{ width: w, height: d, top: (h - d) / 2, background: top, transform: `rotateX(90deg) translateZ(${h / 2}px)` }} />
    </div>
  )
}

const FLOORS = [
  { front: '#6D4FF0', side: '#4B30C8', top: '#8C75F5' },
  { front: '#FF6F8A', side: '#E04865', top: '#FF93A8' },
  { front: '#FFB933', side: '#E09A10', top: '#FFD070' },
  { front: '#2FCB9C', side: '#0E9C74', top: '#6FE3BF' },
  { front: '#46B4FF', side: '#1E8FE0', top: '#86CFFF' },
]

/** A rotating apartment tower. Pure CSS 3D: no WebGL, no external scripts. */
export function Tower3D({ className, tiltX = 0, tiltY = 0 }: { className?: string; tiltX?: number; tiltY?: number }) {
  return (
    <div className={cn('scene3d relative', className)} style={{ perspective: 1400 }} aria-hidden>
      <div className="absolute inset-0 transition-transform duration-300 ease-out" style={{ transformStyle: 'preserve-3d', transform: `rotateX(${tiltX}deg) rotateY(${tiltY}deg)` }}>
        <div className="absolute left-1/2 top-[60%] h-0 w-0 animate-spiny" style={{ transformStyle: 'preserve-3d' }}>
          <Box w={330} d={330} h={14} y={-8} front="#2A2670" side="#1E1B4B" top="#3A3590" windows={false} />
          {FLOORS.map((f, i) => <Box key={i} w={250 - i * 12} d={250 - i * 12} h={58} y={6 + i * 58} {...f} />)}
          <Box w={120} d={120} h={36} y={6 + FLOORS.length * 58} front="#FFFFFF" side="#E3DEFA" top="#FF5C7A" lit="#8C75F5" />
        </div>
      </div>
    </div>
  )
}

/** Hero wrapper: tower plus floating chips; reacts to the mouse. */
export function HeroScene() {
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const move = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTilt({ x: ((e.clientY - r.top) / r.height - 0.5) * -10, y: ((e.clientX - r.left) / r.width - 0.5) * 18 })
  }
  const chip = 'absolute flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-sm font-semibold text-ink shadow-pop'
  return (
    <div className="relative mx-auto h-[400px] w-full max-w-[520px] sm:h-[520px]" onMouseMove={move} onMouseLeave={() => setTilt({ x: 0, y: 0 })}>
      <div className="absolute inset-0 origin-center scale-[0.72] sm:scale-100"><Tower3D className="h-full w-full" tiltX={tilt.x} tiltY={tilt.y} /></div>
      <div className={cn(chip, 'left-0 top-10 animate-float sm:-left-4')}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-jade text-white">✓</span>Rent received ₹18,000</div>
      <div className={cn(chip, 'right-0 top-28 animate-float-slow sm:-right-6')} style={{ animationDelay: '-2s' }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-coral text-white">!</span>2 requests open</div>
      <div className={cn(chip, 'bottom-24 left-2 animate-float-slow sm:-left-8')} style={{ animationDelay: '-4s' }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-marigold text-white">⟳</span>Agreement renewed</div>
      <div className={cn(chip, 'bottom-10 right-4 animate-float sm:right-0')} style={{ animationDelay: '-1s' }}><span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white">6</span>Code verified</div>
    </div>
  )
}
