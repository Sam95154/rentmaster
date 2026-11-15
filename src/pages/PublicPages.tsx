import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Check, CreditCard, FileSignature, KeyRound, Menu, ShieldCheck, Sparkles, UserCog, Users, Wrench, X } from 'lucide-react'
import { Badge, Button, Card, Logo, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Reveal, useTilt } from '@/lib/motion'
import { HeroScene } from '@/components/Scene3D'

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
      <footer className="bg-navy">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-white/70 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo light />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/terms" className="hover:text-white">Terms</Link>
            <Link to="/contact" className="hover:text-white">Contact</Link>
          </div>
          <p>© {new Date().getFullYear()} RentMaster</p>
        </div>
      </footer>
    </div>
  )
}

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16', className)}>{children}</section>
}

const FEATURES: { icon: typeof Building2; title: string; text: string; status: 'live' | 'soon'; hue: string }[] = [
  { icon: Building2, title: 'Properties and units', text: 'Manage buildings, floors and every rental unit with rent, deposit and status.', status: 'live', hue: 'from-brand to-[#7B5CF0]' },
  { icon: Users, title: 'Tenants and tenancies', text: 'Add tenants, assign them to units, transfer them and end tenancies safely.', status: 'live', hue: 'from-coral to-[#E0405F]' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Row-level security means one owner can never see another owner’s properties or tenants.', status: 'live', hue: 'from-jade to-[#0E9C74]' },
  { icon: CreditCard, title: 'Rent and payments', text: 'Invoices, partial payments, receipts and offline payment records. Online payment with verified webhooks is switched on once Razorpay is connected.', status: 'live', hue: 'from-marigold to-[#F08A00]' },
  { icon: Wrench, title: 'Maintenance requests', text: 'Tenants raise requests with photos; owners assign, track and close them.', status: 'live', hue: 'from-sky to-[#1E8FE0]' },
  { icon: FileSignature, title: 'Deposits and reports', text: 'Deposit ledger, income and expense reports with CSV export.', status: 'live', hue: 'from-brand to-coral' },
  { icon: KeyRound, title: 'Rental agreements', text: 'Agreement records, expiry tracking and renewal reminders.', status: 'live', hue: 'from-jade to-sky' },
]

const TAPE = [
  ['Rent invoices', 'bg-brand'], ['Partial payments', 'bg-coral'], ['Receipts', 'bg-marigold'], ['Security deposits', 'bg-jade'], ['Maintenance requests', 'bg-sky'],
  ['Agreements', 'bg-brand'], ['Reports', 'bg-coral'], ['Announcements', 'bg-marigold'], ['Messages', 'bg-jade'], ['Expenses', 'bg-sky'],
] as const

function RoleCard({ title, line, points, grad, icon: Icon, to, cta }: { title: string; line: string; points: string[]; grad: string; icon: typeof Building2; to: string; cta: string }) {
  const tilt = useTilt<HTMLDivElement>(9)
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className={cn('tilt relative flex h-full flex-col overflow-hidden rounded-3xl bg-gradient-to-br p-6 text-white shadow-pop sm:p-7', grad)}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" />
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur" style={{ transform: 'translateZ(40px)' }}><Icon className="h-6 w-6" aria-hidden /></span>
      <h3 className="mt-5 text-2xl font-extrabold" style={{ transform: 'translateZ(30px)' }}>{title}</h3>
      <p className="mt-1 font-medium text-white/90" style={{ transform: 'translateZ(20px)' }}>{line}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm font-medium text-white/95">
        {points.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{p}</li>)}
      </ul>
      <Link to={to} className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:gap-3 hover:shadow-pop" style={{ transform: 'translateZ(30px)' }}>{cta}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </div>
  )
}

function DashboardMock() {
  const tilt = useTilt<HTMLDivElement>(5, 'perspective(1400px) rotateX(5deg) rotateY(-7deg)')
  const bars = [38, 52, 44, 66, 58, 80, 72, 94]
  const kpis = [['Collected', '₹1,24,000', 'from-jade to-[#0E9C74]'], ['Due this month', '₹36,000', 'from-marigold to-[#F08A00]'], ['Occupied units', '18 / 20', 'from-brand to-[#7B5CF0]'], ['Open requests', '3', 'from-coral to-[#E0405F]']]
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="tilt mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_30px_80px_rgba(30,27,75,0.28)]" style={{ transform: 'perspective(1400px) rotateX(5deg) rotateY(-7deg)' }}>
      <div className="flex items-center gap-1.5 bg-navy px-4 py-2.5"><span className="h-3 w-3 rounded-full bg-coral" /><span className="h-3 w-3 rounded-full bg-marigold" /><span className="h-3 w-3 rounded-full bg-jade" /><span className="ml-3 rounded-md bg-white/10 px-3 py-0.5 text-xs text-white/70">Sample data</span></div>
      <div className="grid gap-4 p-4 sm:grid-cols-4 sm:p-6">
        {kpis.map(([l, v, g]) => (
          <div key={l} className={cn('rounded-xl bg-gradient-to-br p-4 text-white', g)}><p className="text-xs font-medium text-white/85">{l}</p><p className="mt-1 font-display text-xl font-extrabold">{v}</p></div>
        ))}
        <div className="rounded-xl border border-line p-4 sm:col-span-3">
          <p className="text-sm font-semibold text-ink">Rent collected, last 8 months</p>
          <div className="mt-4 flex h-36 items-end gap-2 sm:gap-3">
            {bars.map((h, i) => <div key={i} className="bar flex-1 rounded-t-md bg-gradient-to-t from-brand to-coral" style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />)}
          </div>
        </div>
        <div className="rounded-xl border border-line p-4">
          <p className="text-sm font-semibold text-ink">Today</p>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-jade" />Payment received</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-marigold" />Invoice due</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-coral" />Leak reported</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

export function Landing() {
  return (
    <>
      <div className="relative overflow-hidden bg-navy text-white">
        <div className="pointer-events-none absolute -left-24 top-10 h-80 w-80 animate-blob rounded-full bg-brand/60 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-72 w-72 animate-blob rounded-full bg-coral/40 blur-3xl" style={{ animationDelay: '-5s' }} />
        <div className="pointer-events-none absolute -bottom-16 left-1/3 h-72 w-72 animate-blob rounded-full bg-jade/30 blur-3xl" style={{ animationDelay: '-9s' }} />
        <Section className="relative grid items-center gap-8 py-12 sm:py-20 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-medium text-white/90 ring-1 ring-white/20"><Sparkles className="h-4 w-4 text-marigold" aria-hidden />Rental management for India</span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.05] sm:text-6xl">Rent, tenants and properties in one place.</h1>
            <p className="mt-5 max-w-lg text-lg text-white/75">Send invoices, record payments, track agreements and answer maintenance requests. Owners, tenants and admins each get their own panel.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register"><Button className="h-12 w-full px-6 text-base sm:w-auto">Create free account<ArrowRight className="h-4 w-4" aria-hidden /></Button></Link>
              <Link to="/login"><Button variant="secondary" className="h-12 w-full border-white/30 bg-white/10 px-6 text-base text-white hover:bg-white/20 sm:w-auto">Sign in</Button></Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-white/65"><KeyRound className="h-4 w-4" aria-hidden />Sign in with a 6-digit code sent to your email. No links to click.</p>
          </div>
          <HeroScene />
        </Section>
      </div>

      <div className="overflow-hidden border-y border-line bg-white py-4" aria-label="What RentMaster covers">
        <div className="flex w-max animate-marquee gap-4">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 gap-4" aria-hidden={k === 1}>
              {TAPE.map(([t, c]) => <span key={`${k}${t}`} className="inline-flex items-center gap-2 rounded-full bg-surface px-4 py-2 text-sm font-semibold text-ink"><span className={cn('h-2.5 w-2.5 rounded-full', c)} />{t}</span>)}
            </div>
          ))}
        </div>
      </div>

      <Section>
        <Reveal>
          <h2 className="max-w-2xl text-3xl font-extrabold text-ink sm:text-4xl">One platform, three doors</h2>
          <p className="mt-2 max-w-xl text-ink-soft">Everyone signs in at the same page and lands in the panel made for them.</p>
        </Reveal>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          <Reveal><RoleCard title="Owners" line="Stop chasing rent." grad="from-brand to-[#7B5CF0]" icon={Building2} to="/register" cta="Create an owner account"
            points={['Properties, units and tenants', 'Invoices, payments and receipts', 'Agreements with renewal reminders']} /></Reveal>
          <Reveal delay={120}><RoleCard title="Tenants" line="Know what you owe." grad="from-[#FF5C7A] to-[#D93A63]" icon={Users} to="/register" cta="Register with your owner’s email"
            points={['Your rent, receipts and deposit', 'Raise maintenance requests with photos', 'Message your owner']} /></Reveal>
          <Reveal delay={240}><RoleCard title="Admins" line="Run the platform." grad="from-[#0FA37A] to-[#0A7F68]" icon={UserCog} to="/login" cta="Admin sign in"
            points={['Owners, plans and transactions', 'Support tickets and announcements', 'Audit logs and platform settings']} /></Reveal>
        </div>
      </Section>

      <div className="bg-gradient-to-b from-surface to-white">
        <Section>
          <Reveal className="text-center">
            <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">See your whole portfolio at a glance</h2>
            <p className="mx-auto mt-2 max-w-xl text-ink-soft">Collections, dues, occupancy and open requests on one screen. Move your mouse over it.</p>
          </Reveal>
          <Reveal className="mt-10"><DashboardMock /></Reveal>
        </Section>
      </div>

      <Section>
        <Reveal><h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Built for every part of renting</h2></Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="group h-full rounded-2xl border border-line bg-white p-5 shadow-card transition duration-200 hover:-translate-y-1.5 hover:shadow-pop">
                <span className={cn('flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-sm transition duration-300 group-hover:rotate-6 group-hover:scale-110', f.hue)}><f.icon className="h-6 w-6" aria-hidden /></span>
                <h3 className="mt-4 text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-1 text-sm text-ink-soft">{f.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section className="pt-0">
        <Reveal><h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Start in three steps</h2></Reveal>
        <Reveal className="relative mt-10">
          <div className="draw absolute left-[16%] right-[16%] top-7 hidden h-1 rounded-full bg-gradient-to-r from-brand via-coral to-jade md:block" />
          <ol className="grid gap-8 md:grid-cols-3">
            {[['Add your property', 'List the building and its units with rent and deposit.', 'bg-brand'], ['Assign a tenant', 'Add the tenant’s email. They register and see their own panel.', 'bg-coral'], ['Collect rent', 'Invoices are created, payments recorded and receipts issued.', 'bg-jade']].map(([t, d, c], i) => (
              <li key={t} className="relative text-center">
                <span className={cn('pop mx-auto flex h-14 w-14 items-center justify-center rounded-full font-display text-xl font-extrabold text-white shadow-pop', c)} style={{ animationDelay: `${i * 220}ms` }}>{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold text-ink">{t}</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </Section>

      <Section className="pt-0">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-[#7B5CF0] to-coral p-8 text-white shadow-glow sm:p-14">
            <div className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 animate-float rounded-full bg-marigold/70" />
            <div className="pointer-events-none absolute bottom-6 right-24 h-16 w-16 animate-float-slow rounded-2xl bg-white/25" style={{ transform: 'rotate(18deg)' }} />
            <div className="pointer-events-none absolute -bottom-10 left-1/3 h-32 w-32 animate-float rounded-full bg-jade/60" style={{ animationDelay: '-3s' }} />
            <h2 className="relative max-w-xl text-3xl font-extrabold sm:text-4xl">Ready to run your rentals the easy way?</h2>
            <p className="relative mt-2 max-w-md text-white/90">Create your owner account in a minute. Your tenants register with the email you add.</p>
            <div className="relative mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/register"><button type="button" className="h-12 w-full rounded-lg bg-white px-6 text-base font-semibold text-navy transition hover:shadow-pop active:scale-[0.98] sm:w-auto">Create free account</button></Link>
              <Link to="/features"><button type="button" className="h-12 w-full rounded-lg border border-white/50 px-6 text-base font-semibold text-white transition hover:bg-white/15 sm:w-auto">See all features</button></Link>
            </div>
          </div>
        </Reveal>
      </Section>
    </>
  )
}

export function FeaturesPage() {
  return (
    <Section>
      <h1 className="text-3xl font-semibold text-ink">Features</h1>
      <p className="mt-2 max-w-2xl text-ink-soft">What works today and what is on the roadmap.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} className="flex gap-4 p-5">
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white", f.hue)}><f.icon className="h-5 w-5" aria-hidden /></span>
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
  const privacy = kind === 'privacy'
  return (
    <Section className="max-w-3xl">
      <h1 className="text-3xl font-semibold text-ink">{privacy ? 'Privacy Policy' : 'Terms and Conditions'}</h1>
      <p className="mt-3 rounded-lg bg-warning-50 px-3 py-2 text-sm text-amber-800">Template text. Have it reviewed by a qualified lawyer and adapted to your business before launch.</p>
      <div className="mt-6 space-y-4 text-sm leading-6 text-ink-soft">
        {privacy ? (
          <>
            <p>We collect the details you give us (name, email, phone) and the property, tenant and rent records you enter. Owners control their own records; other owners cannot see them.</p>
            <p>We use this information only to provide the service, keep it secure and contact you about your account. We do not sell personal data.</p>
            <p>You can ask us to correct or delete your data by contacting support.</p>
          </>
        ) : (
          <>
            <p>RentMaster provides software for recording rental properties, tenants and rent. Owners are responsible for the accuracy of the records they enter and for their own rental agreements and legal compliance.</p>
            <p>Agreement templates, when available, are not legal advice and are not legally reviewed documents.</p>
            <p>You must keep your login details private and tell us promptly about any unauthorised access.</p>
          </>
        )}
      </div>
    </Section>
  )
}
