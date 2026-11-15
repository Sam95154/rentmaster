import { lazy, Suspense } from 'react'
import { cn } from '@/lib/utils'

const CityScene = lazy(() => import('@/components/CityScene'))

// A real photo or video dropped into src/assets/hero (hero.jpg / hero.mp4 ...) replaces the generated city.
const found = import.meta.glob('/src/assets/hero/hero.{mp4,webm,jpg,jpeg,webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const url = Object.values(found)[0]
const isVideo = !!url && /\.(mp4|webm)(\?|$)/.test(url)

export default function HeroMedia({ mode = 'hero', className }: { mode?: 'hero' | 'compact'; className?: string }) {
  if (url && isVideo) return <video className={cn('object-cover', className)} src={url} autoPlay muted loop playsInline aria-hidden />
  if (url) return <div className={cn('overflow-hidden', className)} aria-hidden><img src={url} alt="" className="h-full w-full animate-kenburns object-cover" /></div>
  return <Suspense fallback={null}><CityScene mode={mode} className={className} /></Suspense>
}
