import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Check, ClipboardList, CreditCard, FileSignature, History, KeyRound, LockKeyhole, Menu, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import { Badge, Button, Card, Logo, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Reveal, useTilt } from '@/lib/motion'
import HeroMedia from '@/components/HeroMedia'
import { PRIVACY, TERMS } from '@/pages/legalContent'


const LINKS = [
  { to: '/features', label: 'Features' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/about', label: 'About' },
  { to: '/contact', label: 'Contact' },
]

export function PublicLayout() {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/"><Logo /></Link>
          <nav aria-label="Main" className="hidden items-center gap-6 md:flex">
            {LINKS.map((l) => <NavLink key={l.to} to={l.to} className={({ isActive }) => cn('text-sm font-medium', isActive ? 'text-brand' : 'text-ink-soft hover:text-ink')}>{l.label}</NavLink>)}
          </nav>
          <div className="hidden items-center gap-2 md:flex">
            <Link to="/login"><Button variant="ghost">Sign in</Button></Link>
            <Link to="/register"><Button>Get started</Button></Link>
          </div>
          <button type="button" className="rounded-lg p-2 md:hidden" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="space-y-1 border-t border-line px-4 py-3 md:hidden">
            {LINKS.map((l) => <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 text-sm font-medium hover:bg-surface">{l.label}</Link>)}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Link to="/login" onClick={() => setOpen(false)}><Button variant="secondary" className="w-full">Sign in</Button></Link>
              <Link to="/register" onClick={() => setOpen(false)}><Button className="w-full">Get started</Button></Link>
            </div>
          </div>
        )}
      </header>
      <div className="flex-1"><Outlet /></div>
      <footer className="bg-navy text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs leading-6">Rent collection, tenancy records and maintenance for landlords and property managers.</p>
          </div>
          <nav aria-label="Product" className="space-y-2"><p className="font-semibold text-white">Product</p><Link to="/features" className="block hover:text-white">Features</Link><Link to="/pricing" className="block hover:text-white">Pricing</Link><Link to="/register" className="block hover:text-white">Create account</Link></nav>
          <nav aria-label="Company" className="space-y-2"><p className="font-semibold text-white">Company</p><Link to="/about" className="block hover:text-white">About</Link><Link to="/contact" className="block hover:text-white">Contact</Link></nav>
          <nav aria-label="Legal" className="space-y-2"><p className="font-semibold text-white">Legal</p><Link to="/privacy" className="block hover:text-white">Privacy policy</Link><Link to="/terms" className="block hover:text-white">Terms and conditions</Link></nav>
        </div>
        <div className="border-t border-white/10"><p className="mx-auto max-w-6xl px-4 py-5 text-xs text-white/50 sm:px-6">© {new Date().getFullYear()} RentMaster. All rights reserved.</p></div>
      </footer>
    </div>
  )
}

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16', className)}>{children}</section>
}


const FEATURES: { icon: typeof Building2; title: string; text: string; status: 'live' | 'soon'; hue: string }[] = [
  { icon: Building2, title: 'Properties and units', text: 'Keep every building, floor and unit on record, with its rent, deposit and occupancy status.', status: 'live', hue: 'bg-[#E3EEF8] text-[#1F5A8A]' },
  { icon: Users, title: 'Tenancies', text: 'Assign tenants to units, transfer them between units and end a tenancy with the history preserved.', status: 'live', hue: 'bg-[#DDF3EF] text-[#0B7F70]' },
  { icon: CreditCard, title: 'Rent and payments', text: 'Generate invoices, record full or partial payments and issue receipts. Online payment through Razorpay is available once the platform enables it.', status: 'live', hue: 'bg-[#FBF0DA] text-[#A9731B]' },
  { icon: Wrench, title: 'Maintenance', text: 'Tenants report issues with photos. Owners assign, update and close each request, and both sides see the status.', status: 'live', hue: 'bg-[#FBE5E1] text-[#B6453B]' },
  { icon: FileSignature, title: 'Rental agreements', text: 'Record agreement terms, track end dates and renew in one step. Owners are reminded 30 and 7 days before an agreement ends.', status: 'live', hue: 'bg-[#ECE6FA] text-[#6A4CC2]' },
  { icon: ClipboardList, title: 'Deposits and reports', text: 'Maintain a security deposit ledger and export income, expense, outstanding-rent and vacancy reports as CSV.', status: 'live', hue: 'bg-[#E1F0F8] text-[#1E7FA8]' },
]

const ROLES = [
  { icon: Building2, title: 'Owners and managers', line: 'One place to run the portfolio.', points: ['Properties, units and tenants', 'Invoices, payments and receipts', 'Agreements, deposits and reports'], to: '/register', cta: 'Create an owner account' },
  { icon: Users, title: 'Tenants', line: 'A clear view of your tenancy.', points: ['Rent due, payment history and receipts', 'Maintenance requests with photos', 'Direct messages with your owner'], to: '/register', cta: 'Register with your owner’s email' },
]

const STEPS = [
  ['Set up your properties', 'Add each building and its units, with the rent and security deposit.'],
  ['Invite your tenants', 'Add the tenant’s email address. They register with it and see only their own tenancy.'],
  ['Collect and track rent', 'Invoices are generated, payments recorded, and receipts and reports are ready when you need them.'],
] as const

const SECURITY = [
  { icon: KeyRound, title: 'Protected sign-in', text: 'Accounts are secured with hashed passwords and a verified email address, and every session is tied to its own role.' },
  { icon: LockKeyhole, title: 'Strict data separation', text: 'Access rules are enforced in the database itself. One owner can never read another owner’s properties, tenants or payments.' },
  { icon: ShieldCheck, title: 'Verified payments', text: 'An online payment marks an invoice as paid only after the payment gateway’s signed confirmation is verified on the server.' },
  { icon: History, title: 'Audit trail', text: 'Changes to financial and account records are written to an audit log that cannot be edited from the app.' },
]

const FAQ = [
  ['Who can create an account?', 'Property owners and managers register directly. Tenants register with the email address their owner added, which links the new account to the correct tenancy automatically.'],
  ['How do tenants pay rent?', 'Owners record payments received by cash, bank transfer or UPI. Online payment through Razorpay is available once the platform enables it; the invoice is marked paid only after the gateway confirms the payment.'],
  ['Can other owners see my data?', 'No. Each owner’s records are isolated at the database level. The platform operator manages accounts and subscriptions but does not see tenants’ personal documents.'],
  ['Does RentMaster send reminders?', 'Rent and agreement reminders appear inside the app and in the notification bell. Email and SMS reminders are not available yet.'],
  ['Can I export my records?', 'Yes. Income, expense, outstanding rent and vacancy reports can be exported as CSV files.'],
] as const

function SectionHead({ title, lede, className }: { title: string; lede?: string; className?: string }) {
  return (
    <div className={cn('max-w-3xl', className)}>
      <h2 className="font-serif text-4xl font-medium leading-[1.1] tracking-tight text-ink sm:text-5xl">{title}</h2>
      {lede && <p className="mt-5 max-w-2xl text-lg leading-8 text-ink-soft">{lede}</p>}
    </div>
  )
}

function DashboardMock() {
  const tilt = useTilt<HTMLDivElement>(8, 'perspective(1400px) rotateX(6deg) rotateY(-8deg)')
  const bars = [38, 52, 44, 66, 58, 80, 72, 94]
  const kpiColors = ['border-t-[#1F5A8A]', 'border-t-[#C8963E]', 'border-t-[#0B7F70]', 'border-t-[#B6453B]']
  const kpis = [['Collected this month', '₹1,24,000'], ['Outstanding', '₹36,000'], ['Occupied units', '18 of 20'], ['Open requests', '3']]
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="tilt mx-auto w-full max-w-5xl overflow-hidden rounded-xl border border-line bg-white shadow-[0_30px_80px_rgba(14,22,33,0.22)]" style={{ transform: 'perspective(1400px) rotateX(6deg) rotateY(-8deg)' }}>
      <div className="flex items-center gap-1.5 bg-navy px-4 py-2.5"><span className="h-3 w-3 rounded-full bg-white/25" /><span className="h-3 w-3 rounded-full bg-white/25" /><span className="h-3 w-3 rounded-full bg-white/25" /><span className="ml-3 rounded-md bg-white/10 px-3 py-0.5 text-xs text-white/70">Owner dashboard · sample data</span></div>
      <div className="grid gap-4 bg-surface p-4 sm:grid-cols-4 sm:p-6">
        {kpis.map(([l, v], i) => (
          <div key={l} className={cn('rounded-lg border border-t-4 border-line bg-white p-4', kpiColors[i])}><p className="text-xs font-medium text-ink-mute">{l}</p><p className={cn('mt-1 font-display text-xl font-extrabold', i === 3 ? 'text-coral' : 'text-ink')}>{v}</p></div>
        ))}
        <div className="rounded-lg border border-line bg-white p-4 sm:col-span-3">
          <p className="text-sm font-semibold text-ink">Rent collected, last 8 months</p>
          <div className="mt-4 flex h-36 items-end gap-2 sm:gap-3">
            {bars.map((h, i) => <div key={i} className={cn('bar flex-1 rounded-t', i === bars.length - 1 ? 'bg-brass' : i % 2 ? 'bg-[#0B7F70]' : 'bg-brand')} style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />)}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">Recent activity</p>
          <ul className="mt-3 space-y-3 text-sm text-ink-soft">
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" />Payment received</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brass" />Invoice due in 3 days</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />Maintenance request opened</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function HeroStack() {
  const tilt = useTilt<HTMLDivElement>(7, 'perspective(1200px) rotateX(6deg) rotateY(-14deg)')
  const layer = (z: number, className: string, delay: string, children: ReactNode) => (
    <div className={cn('absolute', className)} style={{ transform: `translateZ(${z}px)` }}>
      <div className="animate-float rounded-2xl border border-white/60 bg-white/95 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur" style={{ animationDelay: delay }}>{children}</div>
    </div>
  )
  return (
    <div className="hidden h-[26rem] lg:block" aria-hidden>
      <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="tilt relative mx-auto h-full w-full max-w-md" style={{ transform: 'perspective(1200px) rotateX(6deg) rotateY(-14deg)' }}>
        {layer(20, 'left-0 top-4 w-64', '0s', <>
          <p className="text-xs font-medium text-ink-mute">Collected this month</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">₹1,24,000</p>
          <div className="mt-3 flex h-14 items-end gap-1.5">
            {[40, 55, 45, 70, 60, 85, 100].map((h, i) => <span key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 6 ? '#C8963E' : i % 2 ? '#0B7F70' : '#1F5A8A' }} />)}
          </div>
        </>)}
        {layer(70, 'right-0 top-32 w-60', '1.2s', <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DDF3EF] text-[#0B7F70]"><Check className="h-5 w-5" /></span>
          <div><p className="text-sm font-semibold text-ink">Rent received</p><p className="text-xs text-ink-mute">Unit 2B · ₹18,500 · UPI</p></div>
        </div>)}
        {layer(40, 'left-6 top-60 w-60', '2.1s', <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FBE5E1] text-[#B6453B]"><Wrench className="h-5 w-5" /></span>
          <div><p className="text-sm font-semibold text-ink">Leaking tap, Unit 4A</p><p className="text-xs text-ink-mute">Assigned · plumber tomorrow</p></div>
        </div>)}
        {layer(95, 'right-4 top-[21rem] w-52', '3s', <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ECE6FA] text-[#6A4CC2]"><FileSignature className="h-5 w-5" /></span>
          <div><p className="text-sm font-semibold text-ink">Agreement ends</p><p className="text-xs text-ink-mute">Renew in 30 days</p></div>
        </div>)}
      </div>
      <p className="mt-2 text-center text-xs text-white/55">Sample data</p>
    </div>
  )
}

export function Landing() {
  return (
    <>
      {/* Hero */}
      <div className="relative overflow-hidden bg-navy text-white">
        <HeroMedia className="absolute inset-0 h-full w-full" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/55 to-navy/10" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-navy to-transparent" />
        <Section className="relative pb-10 pt-20 sm:pt-32">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div>
          <h1 className="max-w-3xl font-serif text-5xl font-medium leading-[1.04] tracking-tight sm:text-7xl">Rental management, handled with precision.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-white/80">Collect rent, keep tenancy records and agreements, and resolve maintenance from a single system. Tenants see exactly what they owe.</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/register"><button type="button" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brass px-6 text-base font-semibold text-navy transition hover:brightness-110 active:scale-[0.98] sm:w-auto">Create owner account<ArrowRight className="h-4 w-4" aria-hidden /></button></Link>
            <Link to="/login"><button type="button" className="h-12 w-full rounded-lg border border-white/40 px-6 text-base font-semibold text-white transition hover:bg-white/10 sm:w-auto">Sign in</button></Link>
          </div>
          </div>
          <HeroStack />
          </div>
          <dl className="mt-20 grid gap-6 border-t border-white/20 pt-6 text-sm sm:mt-32 sm:grid-cols-3 sm:gap-10">
            {[['Made for Indian rentals', 'Amounts in rupees, with cash, bank transfer and UPI payments recorded.'], ['Private by design', 'Each owner’s records are isolated in the database.'], ['Payments you can trust', 'An invoice is marked paid only after the gateway confirms it.']].map(([t, d]) => (
              <div key={t}><dt className="font-semibold text-white">{t}</dt><dd className="mt-1 leading-6 text-white/65">{d}</dd></div>
            ))}
          </dl>
        </Section>
      </div>

      {/* Capabilities */}
      <Section className="py-20 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <Reveal className="lg:sticky lg:top-28 lg:self-start"><SectionHead title="Everything a rental portfolio needs." lede="From the first unit you add to the monthly report you hand your accountant, the records stay consistent and traceable." /></Reveal>
          <ul className="divide-y divide-line border-y border-line">
            {FEATURES.map((f) => (
              <li key={f.title} className="grid gap-2 py-6 sm:grid-cols-[15rem_1fr] sm:gap-8">
                <h3 className="flex items-center gap-3 text-lg font-semibold text-ink"><span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', f.hue)}><f.icon className="h-5 w-5" aria-hidden /></span>{f.title}</h3>
                <p className="leading-7 text-ink-soft">{f.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Product preview */}
      <div className="bg-surface">
        <Section className="py-20 sm:py-28">
          <Reveal><SectionHead title="Your whole portfolio on one screen." lede="Collections, outstanding rent, occupancy and open maintenance requests are visible the moment you sign in." /></Reveal>
          <Reveal className="mt-14"><DashboardMock /></Reveal>
        </Section>
      </div>

      {/* Roles */}
      <Section className="py-20 sm:py-28">
        <Reveal><SectionHead title="One platform for owners and their tenants." lede="Both sign in on the same page and each lands in a panel designed for their role." /></Reveal>
        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-line bg-line md:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r.title} className="flex flex-col bg-white p-8 sm:p-10">
              <h3 className="font-serif text-3xl font-medium tracking-tight text-ink">{r.title}</h3>
              <p className="mt-2 text-ink-soft">{r.line}</p>
              <ul className="mt-6 flex-1 space-y-3 text-ink-soft">
                {r.points.map((p) => <li key={p} className="flex gap-3"><Check className="mt-1 h-4 w-4 shrink-0 text-brand" aria-hidden />{p}</li>)}
              </ul>
              <Link to={r.to} className="mt-8 inline-flex w-fit items-center gap-2 font-semibold text-brand hover:gap-3 hover:underline">{r.cta}<ArrowRight className="h-4 w-4 transition-all" aria-hidden /></Link>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <div className="bg-surface">
        <Section className="py-20 sm:py-28">
          <Reveal><SectionHead title="Set up in three steps." lede="Most owners finish their first property and tenant in a few minutes." /></Reveal>
          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-12">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="border-t-2 border-ink pt-5">
                <span className={cn('font-serif text-5xl font-medium', ['text-[#1F5A8A]', 'text-[#0B7F70]', 'text-[#C8963E]'][i])}>{i + 1}</span>
                <h3 className="mt-3 text-xl font-semibold text-ink">{t}</h3>
                <p className="mt-2 leading-7 text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* Security */}
      <div className="bg-navy text-white">
        <Section className="py-20 sm:py-28">
          <Reveal><SectionHead title="Built to protect financial records." lede="The controls that protect your data run on the server, not in the browser." className="[&_h2]:text-white [&_p]:text-white/70" /></Reveal>
          <div className="mt-14 grid gap-x-16 gap-y-10 sm:grid-cols-2">
            {SECURITY.map((s) => (
              <div key={s.title} className="border-t border-white/20 pt-5">
                <h3 className="flex items-center gap-3 text-lg font-semibold"><s.icon className="h-5 w-5 text-brass" aria-hidden />{s.title}</h3>
                <p className="mt-2 leading-7 text-white/70">{s.text}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>

      {/* FAQ */}
      <Section className="py-20 sm:py-28">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
          <h2 className="font-serif text-4xl font-medium leading-[1.1] tracking-tight text-ink sm:text-5xl">Common questions.</h2>
          <div className="divide-y divide-line border-y border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold text-ink [&::-webkit-details-marker]:hidden">{q}<span className="text-2xl font-normal text-ink-mute transition group-open:rotate-45" aria-hidden>+</span></summary>
                <p className="mt-3 max-w-2xl leading-7 text-ink-soft">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </Section>

      {/* Closing call to action */}
      <div className="bg-gradient-to-br from-navy via-[#173A5C] to-[#0B6F66] text-white">
        <Section className="py-20 text-center sm:py-24">
          <h2 className="mx-auto max-w-2xl font-serif text-4xl font-medium leading-[1.1] tracking-tight sm:text-5xl">Bring your rentals into one reliable system.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-white/70">Create your owner account, add your first property and invite your tenants today.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register"><button type="button" className="h-12 w-full rounded-lg bg-brass px-6 text-base font-semibold text-navy transition hover:brightness-110 active:scale-[0.98] sm:w-auto">Create owner account</button></Link>
            <Link to="/features"><button type="button" className="h-12 w-full rounded-lg border border-white/40 px-6 text-base font-semibold text-white transition hover:bg-white/10 sm:w-auto">View all features</button></Link>
          </div>
        </Section>
      </div>
    </>
  )
}

export function FeaturesPage() {
  return (
    <Section>
      <h1 className="font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">Features</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">What works today and what is on the roadmap.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} className="flex gap-4 p-5">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", f.hue)}><f.icon className="h-5 w-5" aria-hidden /></span>
            <div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-ink">{f.title}</h2><Badge tone={f.status === 'live' ? 'success' : 'neutral'}>{f.status === 'live' ? 'Available' : 'Coming soon'}</Badge></div><p className="mt-1 text-sm text-ink-soft">{f.text}</p></div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

interface Plan { id: string; name: string; price_monthly: number; features: string[] }

export function PricingPage() {
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async () => {
      const { data, error } = await supabase.from('subscription_plans').select('id,name,price_monthly,features').eq('active', true).order('price_monthly')
      if (error) throw error
      return (data ?? []) as Plan[]
    },
  })
  return (
    <Section>
      <h1 className="text-3xl font-semibold text-ink">Pricing</h1>
      <p className="mt-2 text-ink-soft">Simple plans that grow with your portfolio.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {plans.isLoading && [0, 1, 2].map((i) => <Skeleton key={i} className="h-56" />)}
        {plans.isError && <p className="text-sm text-danger md:col-span-3">Pricing could not be loaded right now.</p>}
        {plans.data?.map((p) => (
          <Card key={p.id} className="flex flex-col p-6">
            <h2 className="font-semibold text-ink">{p.name}</h2>
            <p className="mt-2 text-3xl font-semibold text-ink">{p.price_monthly === 0 ? 'Free' : formatINR(p.price_monthly)}{p.price_monthly > 0 && <span className="text-sm font-normal text-ink-mute"> / month</span>}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-soft">
              {(Array.isArray(p.features) ? p.features : []).map((f) => <li key={f} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden />{f}</li>)}
            </ul>
            <Link to="/register" className="mt-6"><Button variant="secondary" className="w-full">Get started</Button></Link>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-mute">Subscription billing is not active yet; every account currently has full access to the features that are available.</p>
    </Section>
  )
}

export function AboutPage() {
  return (
    <Section>
      <h1 className="text-3xl font-semibold text-ink">About RentMaster</h1>
      <p className="mt-4 max-w-2xl text-ink-soft">RentMaster is a rental property and tenant management platform for independent landlords and owners with many buildings. We focus on accurate records, clear ownership boundaries and a calm interface that works on a phone as well as a desktop.</p>
    </Section>
  )
}

export function ContactPage() {
  return (
    <Section>
      <h1 className="text-3xl font-semibold text-ink">Contact</h1>
      <p className="mt-4 max-w-xl text-ink-soft">For questions or support, email us and we will reply as soon as we can.</p>
      <a href="mailto:support@rentmaster.example" className="mt-4 inline-block font-medium text-brand hover:underline">support@rentmaster.example</a>
      <p className="mt-2 text-xs text-ink-mute">Replace this address with your real support inbox before launch.</p>
    </Section>
  )
}

export function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) {
  const doc = kind === 'privacy' ? PRIVACY : TERMS
  const id = (i: number) => `section-${i + 1}`
  return (
    <Section className="py-14 sm:py-20">
      <div className="max-w-3xl">
        <h1 className="font-serif text-4xl font-medium tracking-tight text-ink sm:text-5xl">{doc.title}</h1>
        <p className="mt-3 text-sm text-ink-mute">Last updated {doc.updated}</p>
        <p className="mt-6 text-lg leading-8 text-ink-soft">{doc.intro}</p>
      </div>
      <div className="mt-12 grid gap-12 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
        <nav aria-label="Contents" className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-sm font-semibold text-ink">Contents</p>
          <ol className="mt-3 space-y-2 border-l border-line text-sm">
            {doc.sections.map((sec, i) => <li key={sec.title}><a href={`#${id(i)}`} className="-ml-px block border-l border-transparent pl-4 text-ink-soft hover:border-brand hover:text-brand">{i + 1}. {sec.title}</a></li>)}
          </ol>
        </nav>
        <div className="max-w-3xl space-y-10">
          {doc.sections.map((sec, i) => (
            <section key={sec.title} id={id(i)} className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-ink">{i + 1}. {sec.title}</h2>
              <div className="mt-3 space-y-3 leading-7 text-ink-soft">
                {sec.paras?.map((t) => <p key={t}>{t}</p>)}
                {sec.bullets && <ul className="list-disc space-y-2 pl-5 marker:text-brand">{sec.bullets.map((t) => <li key={t}>{t}</li>)}</ul>}
                {sec.after?.map((t) => <p key={t}>{t}</p>)}
              </div>
            </section>
          ))}
          <p className="border-t border-line pt-6 text-sm text-ink-mute">Questions about this document? <Link to="/contact" className="font-medium text-brand hover:underline">Contact us</Link>.</p>
        </div>
      </div>
    </Section>
  )
}
