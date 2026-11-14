import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Building2, Check, CreditCard, FileSignature, Menu, ShieldCheck, Users, Wrench, X } from 'lucide-react'
import { Badge, Button, Card, Logo, Skeleton } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { formatINR } from '@/lib/utils'
import { cn } from '@/lib/utils'

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
      <header className="sticky top-0 z-20 border-b border-line bg-white/95 backdrop-blur">
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
      <footer className="border-t border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-ink-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo />
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/privacy" className="hover:text-ink">Privacy</Link>
            <Link to="/terms" className="hover:text-ink">Terms</Link>
            <Link to="/contact" className="hover:text-ink">Contact</Link>
          </div>
          <p>© {new Date().getFullYear()} RENTMASTER</p>
        </div>
      </footer>
    </div>
  )
}

function Section({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16', className)}>{children}</section>
}

const FEATURES: { icon: typeof Building2; title: string; text: string; status: 'live' | 'soon' }[] = [
  { icon: Building2, title: 'Properties and units', text: 'Manage buildings, floors and every rental unit with rent, deposit and status.', status: 'live' },
  { icon: Users, title: 'Tenants and tenancies', text: 'Add or invite tenants, assign them to units, transfer them and end tenancies safely.', status: 'live' },
  { icon: ShieldCheck, title: 'Private by design', text: 'Row-level security means one owner can never see another owner’s properties or tenants.', status: 'live' },
  { icon: CreditCard, title: 'Rent and payments', text: 'Invoices, partial payments, receipts and online payment with verified webhooks.', status: 'soon' },
  { icon: Wrench, title: 'Maintenance requests', text: 'Tenants raise requests with photos; owners assign, track and close them.', status: 'soon' },
  { icon: FileSignature, title: 'Agreements and reports', text: 'Agreement expiry tracking, deposit ledger and exportable financial reports.', status: 'soon' },
]

export function Landing() {
  return (
    <>
      <div className="bg-navy text-white">
        <Section className="py-16 sm:py-24">
          <Badge tone="info">Rental management for India</Badge>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Run every rental property from one trusted platform.</h1>
          <p className="mt-4 max-w-2xl text-lg text-white/70">RENTMASTER gives owners a clear view of properties, units and tenants — and gives tenants their own secure space.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/register"><Button className="w-full sm:w-auto">Create free account</Button></Link>
            <Link to="/features"><Button variant="secondary" className="w-full sm:w-auto">See features</Button></Link>
          </div>
        </Section>
      </div>
      <Section>
        <h2 className="text-2xl font-semibold text-ink">Built for owners and tenants</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-5">
              <div className="flex items-center justify-between"><f.icon className="h-6 w-6 text-brand" aria-hidden /><Badge tone={f.status === 'live' ? 'success' : 'neutral'}>{f.status === 'live' ? 'Available' : 'Coming soon'}</Badge></div>
              <h3 className="mt-3 font-semibold text-ink">{f.title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{f.text}</p>
            </Card>
          ))}
        </div>
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
            <f.icon className="mt-0.5 h-6 w-6 shrink-0 text-brand" aria-hidden />
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
      <h1 className="text-3xl font-semibold text-ink">About RENTMASTER</h1>
      <p className="mt-4 max-w-2xl text-ink-soft">RENTMASTER is a rental property and tenant management platform for independent landlords and owners with many buildings. We focus on accurate records, clear ownership boundaries and a calm interface that works on a phone as well as a desktop.</p>
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
            <p>RENTMASTER provides software for recording rental properties, tenants and rent. Owners are responsible for the accuracy of the records they enter and for their own rental agreements and legal compliance.</p>
            <p>Agreement templates, when available, are not legal advice and are not legally reviewed documents.</p>
            <p>You must keep your login details private and tell us promptly about any unauthorised access.</p>
          </>
        )}
      </div>
    </Section>
  )
}
