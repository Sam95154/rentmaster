import { cn } from '@/lib/utils'

// Real footage: put a photo or video of a real city or building at src/assets/hero/hero.mp4 (or hero.jpg / .webp / .png).
// Until a file is there, the hero shows a calm dusk gradient instead of any generated imagery.
const found = import.meta.glob('/src/assets/hero/hero.{mp4,webm,jpg,jpeg,webp,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const url = Object.values(found)[0]
const isVideo = !!url && /\.(mp4|webm)(\?|$)/.test(url)

export default function HeroMedia({ className }: { mode?: 'hero' | 'compact'; className?: string }) {
  if (url && isVideo) return <video className={cn('object-cover', className)} src={url} autoPlay muted loop playsInline aria-hidden />
  if (url) return <div className={cn('overflow-hidden', className)} aria-hidden><img src={url} alt="" className="h-full w-full animate-kenburns object-cover" /></div>
  return <div className={cn('bg-gradient-to-b from-[#0e1621] via-[#2c3a4f] to-[#8a6a4c]', className)} aria-hidden />
}
