import { lazy, Suspense, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Building2, Check, CreditCard, FileSignature, KeyRound, Menu, ShieldCheck, UserCog, Users, Wrench, X } from 'lucide-react'
import { Badge, Button, Card, Logo, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Reveal, useTilt } from '@/lib/motion'


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

const CityScene = lazy(() => import('@/components/CityScene'))

const FEATURES: { icon: typeof Building2; title: string; text: string; status: 'live' | 'soon'; hue: string }[] = [
  { icon: Building2, title: 'Properties and units', text: 'Manage buildings, floors and every rental unit with rent, deposit and status.', status: 'live', hue: 'bg-brand-50 text-brand' },
  { icon: Users, title: 'Tenants and tenancies', text: 'Add tenants, assign them to units, transfer them and end tenancies safely.', status: 'live', hue: 'bg-brand-50 text-brand' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Row-level security means one owner can never see another owner’s properties or tenants.', status: 'live', hue: 'bg-brand-50 text-brand' },
  { icon: CreditCard, title: 'Rent and payments', text: 'Invoices, partial payments, receipts and offline payment records. Online payment with verified webhooks is switched on once Razorpay is connected.', status: 'live', hue: 'bg-brand-50 text-brand' },
  { icon: Wrench, title: 'Maintenance requests', text: 'Tenants raise requests with photos; owners assign, track and close them.', status: 'live', hue: 'bg-brand-50 text-brand' },
  { icon: FileSignature, title: 'Deposits and reports', text: 'Deposit ledger, income and expense reports with CSV export.', status: 'live', hue: 'bg-brand-50 text-brand' },
  { icon: KeyRound, title: 'Rental agreements', text: 'Agreement records, expiry tracking and renewal reminders.', status: 'live', hue: 'bg-brand-50 text-brand' },
]

const TAPE = ['Rent invoices', 'Partial payments', 'Receipts', 'Security deposits', 'Maintenance requests', 'Agreements', 'Reports', 'Announcements', 'Messages', 'Expenses']

function RoleCard({ title, line, points, icon: Icon, to, cta }: { title: string; line: string; points: string[]; icon: typeof Building2; to: string; cta: string }) {
  const tilt = useTilt<HTMLDivElement>(4)
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="tilt flex h-full flex-col rounded-2xl border border-line bg-white p-6 shadow-card transition-shadow duration-200 hover:shadow-pop sm:p-7">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy text-brass"><Icon className="h-6 w-6" aria-hidden /></span>
      <h3 className="mt-5 text-2xl font-extrabold text-ink">{title}</h3>
      <p className="mt-1 font-medium text-ink-soft">{line}</p>
      <ul className="mt-4 flex-1 space-y-2 text-sm text-ink-soft">
        {points.map((p) => <li key={p} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden />{p}</li>)}
      </ul>
      <Link to={to} className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white transition hover:gap-3 hover:bg-navy-600">{cta}<ArrowRight className="h-4 w-4" aria-hidden /></Link>
    </div>
  )
}

function DashboardMock() {
  const tilt = useTilt<HTMLDivElement>(4, 'perspective(1400px) rotateX(4deg) rotateY(-5deg)')
  const bars = [38, 52, 44, 66, 58, 80, 72, 94]
  const kpis = [['Collected', '₹1,24,000'], ['Due this month', '₹36,000'], ['Occupied units', '18 / 20'], ['Open requests', '3']]
  return (
    <div ref={tilt.ref} onMouseMove={tilt.onMouseMove} onMouseLeave={tilt.onMouseLeave} className="tilt mx-auto w-full max-w-4xl overflow-hidden rounded-xl border border-line bg-white shadow-[0_30px_80px_rgba(14,22,33,0.25)]" style={{ transform: 'perspective(1400px) rotateX(4deg) rotateY(-5deg)' }}>
      <div className="flex items-center gap-1.5 bg-navy px-4 py-2.5"><span className="h-3 w-3 rounded-full bg-white/25" /><span className="h-3 w-3 rounded-full bg-white/25" /><span className="h-3 w-3 rounded-full bg-white/25" /><span className="ml-3 rounded-md bg-white/10 px-3 py-0.5 text-xs text-white/70">Sample data</span></div>
      <div className="grid gap-4 bg-surface p-4 sm:grid-cols-4 sm:p-6">
        {kpis.map(([l, v], i) => (
          <div key={l} className="rounded-lg border border-line bg-white p-4"><p className="text-xs font-medium text-ink-mute">{l}</p><p className={cn('mt-1 font-display text-xl font-extrabold', i === 3 ? 'text-coral' : 'text-ink')}>{v}</p></div>
        ))}
        <div className="rounded-lg border border-line bg-white p-4 sm:col-span-3">
          <p className="text-sm font-semibold text-ink">Rent collected, last 8 months</p>
          <div className="mt-4 flex h-36 items-end gap-2 sm:gap-3">
            {bars.map((h, i) => <div key={i} className={cn('bar flex-1 rounded-t', i === bars.length - 1 ? 'bg-brass' : 'bg-brand')} style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }} />)}
          </div>
        </div>
        <div className="rounded-lg border border-line bg-white p-4">
          <p className="text-sm font-semibold text-ink">Today</p>
          <ul className="mt-3 space-y-3 text-sm text-ink-soft">
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" />Payment received</li>
            <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-brass" />Invoice due</li>
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
      <div className="relative min-h-[640px] overflow-hidden bg-navy text-white sm:min-h-[720px]">
        <Suspense fallback={null}><CityScene className="absolute inset-0" /></Suspense>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-navy/90 via-navy/45 to-transparent sm:from-navy/85 sm:via-navy/30" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-navy/80 to-transparent" />
        <Section className="relative flex min-h-[640px] items-center py-16 sm:min-h-[720px]">
          <div className="max-w-xl">
            <h1 className="text-4xl font-extrabold leading-[1.06] sm:text-6xl">Rent, tenants and properties in one place.</h1>
            <p className="mt-5 max-w-lg text-lg text-white/80">Send invoices, record payments, track agreements and answer maintenance requests. Owners, tenants and admins each get their own panel.</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/register"><button type="button" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brass px-6 text-base font-semibold text-navy transition hover:brightness-110 active:scale-[0.98] sm:w-auto">Create free account<ArrowRight className="h-4 w-4" aria-hidden /></button></Link>
              <Link to="/login"><button type="button" className="h-12 w-full rounded-lg border border-white/40 bg-white/5 px-6 text-base font-semibold text-white backdrop-blur transition hover:bg-white/15 sm:w-auto">Sign in</button></Link>
            </div>
            <p className="mt-5 flex items-center gap-2 text-sm text-white/70"><KeyRound className="h-4 w-4" aria-hidden />Sign in with a 6-digit code sent to your email. No links to click.</p>
          </div>
        </Section>
      </div>

      <div className="overflow-hidden border-b border-line bg-white py-4" aria-label="What RentMaster covers">
        <div className="flex w-max animate-marquee gap-8">
          {[0, 1].map((k) => (
            <div key={k} className="flex shrink-0 gap-8" aria-hidden={k === 1}>
              {TAPE.map((t) => <span key={`${k}${t}`} className="inline-flex items-center gap-3 text-sm font-semibold text-ink-soft"><span className="h-1.5 w-1.5 rounded-full bg-brass" />{t}</span>)}
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
          <Reveal><RoleCard title="Owners" line="Stop chasing rent." icon={Building2} to="/register" cta="Create an owner account"
            points={['Properties, units and tenants', 'Invoices, payments and receipts', 'Agreements with renewal reminders']} /></Reveal>
          <Reveal delay={120}><RoleCard title="Tenants" line="Know what you owe." icon={Users} to="/register" cta="Register with your owner’s email"
            points={['Your rent, receipts and deposit', 'Raise maintenance requests with photos', 'Message your owner']} /></Reveal>
          <Reveal delay={240}><RoleCard title="Admins" line="Run the platform." icon={UserCog} to="/login" cta="Admin sign in"
            points={['Owners, plans and transactions', 'Support tickets and announcements', 'Audit logs and platform settings']} /></Reveal>
        </div>
      </Section>

      <div className="bg-surface">
        <Section>
          <Reveal className="text-center">
            <h2 className="text-3xl font-extrabold text-ink sm:text-4xl">See your whole portfolio at a glance</h2>
            <p className="mx-auto mt-2 max-w-xl text-ink-soft">Collections, dues, occupancy and open requests on one screen.</p>
          </Reveal>
          <Reveal className="mt-10"><DashboardMock /></Reveal>
        </Section>
      </div>

      <Section>
        <Reveal><h2 className="text-3xl font-extrabold text-ink sm:text-4xl">Built for every part of renting</h2></Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={(i % 3) * 90}>
              <div className="group h-full rounded-xl border border-line bg-white p-5 shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-pop">
                <span className={cn('flex h-11 w-11 items-center justify-center rounded-lg transition duration-300 group-hover:scale-110', f.hue)}><f.icon className="h-5 w-5" aria-hidden /></span>
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
          <div className="draw absolute left-[16%] right-[16%] top-7 hidden h-px bg-line md:block" />
          <ol className="grid gap-8 md:grid-cols-3">
            {[['Add your property', 'List the building and its units with rent and deposit.'], ['Assign a tenant', 'Add the tenant’s email. They register and see their own panel.'], ['Collect rent', 'Invoices are created, payments recorded and receipts issued.']].map(([t, d], i) => (
              <li key={t} className="relative text-center">
                <span className="pop mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-navy font-display text-xl font-extrabold text-brass shadow-pop" style={{ animationDelay: `${i * 220}ms` }}>{i + 1}</span>
                <h3 className="mt-4 text-lg font-bold text-ink">{t}</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-soft">{d}</p>
              </li>
            ))}
          </ol>
        </Reveal>
      </Section>

      <Section className="pt-0">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0e1621] via-[#33425a] to-[#b98350] p-8 text-white shadow-pop sm:p-14">
            <h2 className="relative max-w-xl text-3xl font-extrabold sm:text-4xl">Ready to run your rentals the easy way?</h2>
            <p className="relative mt-2 max-w-md text-white/85">Create your owner account in a minute. Your tenants register with the email you add.</p>
            <div className="relative mt-6 flex flex-col gap-3 sm:flex-row">
              <Link to="/register"><button type="button" className="h-12 w-full rounded-lg bg-brass px-6 text-base font-semibold text-navy transition hover:brightness-110 active:scale-[0.98] sm:w-auto">Create free account</button></Link>
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
