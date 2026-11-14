import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import { ProtectedRoute, RoleRedirect, FullPageSpinner } from '@/auth/ProtectedRoute'
import { AboutPage, ContactPage, FeaturesPage, Landing, LegalPage, PricingPage, PublicLayout } from '@/pages/PublicPages'
import { ForgotPasswordPage, LoginPage, RegisterPage, ResetPasswordPage } from '@/pages/AuthPages'
import ComingSoon from '@/pages/ComingSoon'
import NotificationsPage from '@/pages/NotificationsPage'
import SettingsPage from '@/pages/SettingsPage'

const OwnerLayout = lazy(() => import('@/pages/owner/OwnerLayout'))
const OwnerDashboard = lazy(() => import('@/pages/owner/Dashboard'))
const Properties = lazy(() => import('@/pages/owner/Properties'))
const PropertyDetail = lazy(() => import('@/pages/owner/PropertyDetail'))
const Units = lazy(() => import('@/pages/owner/Units'))
const Tenants = lazy(() => import('@/pages/owner/Tenants'))
const TenantDetail = lazy(() => import('@/pages/owner/TenantDetail'))
const RentCollection = lazy(() => import('@/pages/owner/finance/Invoices').then((m) => ({ default: m.RentCollection })))
const OwnerInvoices = lazy(() => import('@/pages/owner/finance/Invoices').then((m) => ({ default: m.Invoices })))
const OwnerPayments = lazy(() => import('@/pages/owner/finance/Payments'))
const OwnerDeposits = lazy(() => import('@/pages/owner/finance/Deposits'))
const OwnerExpenses = lazy(() => import('@/pages/owner/finance/Expenses'))
const OwnerReports = lazy(() => import('@/pages/owner/finance/Reports'))
const Receipt = lazy(() => import('@/pages/owner/finance/Receipt'))
const TenantRent = lazy(() => import('@/pages/tenant/MyRent'))
const TenantPayments = lazy(() => import('@/pages/tenant/Payments'))
const TenantDeposit = lazy(() => import('@/pages/tenant/Deposit'))
const MaintenancePage = lazy(() => import('@/pages/shared/Maintenance'))
const DocumentsPage = lazy(() => import('@/pages/shared/Documents'))
const PayRent = lazy(() => import('@/pages/tenant/PayRent'))
const MessagesPage = lazy(() => import('@/pages/shared/Messages'))
const AnnouncementsPage = lazy(() => import('@/pages/shared/Announcements'))
const TenantLayout = lazy(() => import('@/pages/tenant/TenantLayout'))
const TenantDashboard = lazy(() => import('@/pages/tenant/Dashboard'))
const TenantProperty = lazy(() => import('@/pages/tenant/MyProperty'))
const TenantProfile = lazy(() => import('@/pages/tenant/Profile'))
const AdminLayout = lazy(() => import('@/pages/admin/AdminLayout'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const AdminOwners = lazy(() => import('@/pages/admin/Owners'))
const AdminTenants = lazy(() => import('@/pages/admin/Tenants'))
const AdminProperties = lazy(() => import('@/pages/admin/Properties'))
const AdminAudit = lazy(() => import('@/pages/admin/AuditLogs'))
const AdminTransactions = lazy(() => import('@/pages/admin/Transactions'))
const AdminSubscriptions = lazy(() => import('@/pages/admin/Subscriptions'))
const AdminComplaints = lazy(() => import('@/pages/admin/Complaints'))
const AdminAnnouncements = lazy(() => import('@/pages/admin/AdminAnnouncements'))
const AdminPlatform = lazy(() => import('@/pages/admin/PlatformSettings'))
const SupportPage = lazy(() => import('@/pages/shared/Support'))
const SupportRedirect = lazy(() => import('@/pages/shared/Support').then((m) => ({ default: m.SupportRedirect })))

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Landing />} />
          <Route path="features" element={<FeaturesPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="privacy" element={<LegalPage kind="privacy" />} />
          <Route path="terms" element={<LegalPage kind="terms" />} />
        </Route>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/app" element={<RoleRedirect />} />
        <Route path="/support" element={<SupportRedirect />} />

        <Route path="/owner" element={<ProtectedRoute role="owner"><OwnerLayout /></ProtectedRoute>}>
          <Route index element={<OwnerDashboard />} />
          <Route path="properties" element={<Properties />} />
          <Route path="properties/:id" element={<PropertyDetail />} />
          <Route path="units" element={<Units />} />
          <Route path="tenants" element={<Tenants />} />
          <Route path="tenants/:id" element={<TenantDetail />} />
          <Route path="messages" element={<MessagesPage role="owner" />} />
          <Route path="announcements" element={<AnnouncementsPage role="owner" />} />
          <Route path="maintenance" element={<MaintenancePage role="owner" />} />
          <Route path="documents" element={<DocumentsPage role="owner" />} />
          <Route path="rent" element={<RentCollection />} />
          <Route path="invoices" element={<OwnerInvoices />} />
          <Route path="payments" element={<OwnerPayments />} />
          <Route path="deposits" element={<OwnerDeposits />} />
          <Route path="expenses" element={<OwnerExpenses />} />
          <Route path="reports" element={<OwnerReports />} />
          <Route path="receipt/:id" element={<Receipt back="/owner/payments" />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage kind="owner" />} />
          <Route path="*" element={<ComingSoon />} />
        </Route>

        <Route path="/tenant" element={<ProtectedRoute role="tenant"><TenantLayout /></ProtectedRoute>}>
          <Route index element={<TenantDashboard />} />
          <Route path="property" element={<TenantProperty />} />
          <Route path="profile" element={<TenantProfile />} />
          <Route path="messages" element={<MessagesPage role="tenant" />} />
          <Route path="announcements" element={<AnnouncementsPage role="tenant" />} />
          <Route path="pay" element={<PayRent />} />
          <Route path="maintenance" element={<MaintenancePage role="tenant" />} />
          <Route path="documents" element={<DocumentsPage role="tenant" />} />
          <Route path="rent" element={<TenantRent />} />
          <Route path="payments" element={<TenantPayments />} />
          <Route path="deposit" element={<TenantDeposit />} />
          <Route path="receipt/:id" element={<Receipt back="/tenant/payments" />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="settings" element={<SettingsPage kind="tenant" />} />
          <Route path="*" element={<ComingSoon />} />
        </Route>

        <Route path="/admin" element={<ProtectedRoute role="super_admin"><AdminLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="owners" element={<AdminOwners />} />
          <Route path="tenants" element={<AdminTenants />} />
          <Route path="properties" element={<AdminProperties />} />
          <Route path="audit" element={<AdminAudit />} />
          <Route path="transactions" element={<AdminTransactions />} />
          <Route path="subscriptions" element={<AdminSubscriptions />} />
          <Route path="complaints" element={<AdminComplaints />} />
          <Route path="announcements" element={<AdminAnnouncements />} />
          <Route path="platform" element={<AdminPlatform />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage kind="admin" />} />
          <Route path="*" element={<ComingSoon />} />
        </Route>

        <Route path="*" element={<div className="p-10 text-center text-ink-soft">Page not found.</div>} />
      </Routes>
    </Suspense>
  )
}
