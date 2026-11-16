export interface LegalSection { title: string; paras?: string[]; bullets?: string[]; after?: string[] }
export interface LegalDoc { title: string; updated: string; intro: string; sections: LegalSection[] }

const UPDATED = '16 November 2026'

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: UPDATED,
  intro: 'This policy explains what personal information RentMaster collects, why we collect it, who can see it and what choices you have. It applies to owners, property managers and tenants who use the RentMaster website and applications.',
  sections: [
    {
      title: 'Who we are',
      paras: [
        'RentMaster is a rental property and tenant management platform. In this policy, “we”, “us” and “RentMaster” mean the operator of the platform. You can reach us through the Contact page.',
        'For the account and usage information described below, RentMaster decides how and why the information is used. For tenant and property records that an owner enters, the owner decides what is recorded and RentMaster processes it on the owner’s behalf to provide the service.',
      ],
    },
    {
      title: 'Information we collect',
      bullets: [
        'Account details: your name, email address, phone number and role (owner, tenant or administrator). Passwords are handled by our authentication provider and are stored only in hashed form.',
        'Property and tenancy records entered by owners: buildings, units, tenant names and contact details, rental agreements, security deposits, invoices, payments, receipts and expense records.',
        'Maintenance and messages: requests raised by tenants, status updates, photos or documents attached to a request or agreement, and messages exchanged between an owner and a tenant.',
        'Payment information: the amount, date, method and status of a payment. When online payment is enabled, card, UPI and bank details are entered on the payment gateway’s page and are processed by Razorpay. RentMaster does not receive or store card numbers or UPI PINs.',
        'Security and usage records: sign-in times, one-time verification attempts and an audit log of changes to financial and account records.',
      ],
    },
    {
      title: 'How we use your information',
      bullets: [
        'To create and secure your account, and to confirm your email address with a one-time code.',
        'To provide the service: generating invoices, recording payments, issuing receipts, tracking agreements and maintenance, and showing each person the records they are allowed to see.',
        'To send in-app notifications such as rent due dates, agreement reminders and maintenance updates.',
        'To prevent fraud and misuse, to investigate security issues and to keep an audit trail.',
        'To respond to support requests and to meet legal obligations.',
      ],
      after: ['We do not sell personal information and we do not use it for third-party advertising.'],
    },
    {
      title: 'Who can see your information',
      bullets: [
        'Owners can see the properties, units, tenants, agreements, invoices and payments that belong to their own account, and nothing belonging to another owner.',
        'Tenants can see their own tenancy: the unit, rent and invoices, payments and receipts, maintenance requests and messages with their owner.',
        'Platform administrators can see the account, subscription, transaction and support information needed to operate the service. Administrator actions are recorded in an audit log.',
        'Access rules are enforced in the database itself, not only in the user interface.',
      ],
    },
    {
      title: 'Service providers',
      paras: ['We use a small number of providers to run the platform. They process information only to provide their service to us.'],
      bullets: [
        'Supabase: database, authentication and file storage. Our project is hosted in the Mumbai (ap-south-1) region.',
        'Render: hosting of the website.',
        'Razorpay: online payment processing, when the platform enables it.',
        'An email delivery service: to send verification codes and account emails.',
        'Google Fonts: the website loads its typefaces from Google, which may receive your IP address and browser details when a page loads.',
      ],
      after: ['We may also disclose information when the law requires it or to protect the rights and safety of our users.'],
    },
    {
      title: 'Cookies and local storage',
      paras: ['RentMaster uses only what is needed to keep you signed in and to remember basic preferences, such as your session token stored in your browser. We do not use advertising or cross-site tracking cookies.'],
    },
    {
      title: 'How long we keep information',
      paras: [
        'We keep your information while your account is active. If you ask us to close your account, we delete or anonymise your personal information within a reasonable period, except records we must retain by law or to resolve disputes, such as financial records and audit logs.',
        'Owners may need to retain tenancy and payment records for their own tax and legal purposes. Please export what you need before closing an account.',
      ],
    },
    {
      title: 'Security',
      paras: [
        'We protect information with encrypted connections (HTTPS), hashed passwords, row-level access rules in the database, restricted administrator access and an append-only audit log. Payment confirmations from the gateway are verified on the server before an invoice is marked paid.',
        'No online service can be completely secure. Please choose a strong password, keep it private and tell us promptly if you suspect unauthorised access. If a breach affects your personal information, we will notify you and the relevant authority as the law requires.',
      ],
    },
    {
      title: 'Your rights',
      paras: ['Under the Digital Personal Data Protection Act, 2023, and other applicable Indian law, you have the right to:'],
      bullets: [
        'Ask what personal information we hold about you and how it is used.',
        'Ask us to correct inaccurate or incomplete information.',
        'Ask us to erase your information, subject to the retention limits above.',
        'Withdraw consent that you have given for processing, where processing depends on consent.',
        'Raise a grievance and receive a response within a reasonable time.',
      ],
      after: ['Tenants should direct requests about tenancy records to their owner as well, since the owner decides what is recorded. To exercise a right, contact us through the Contact page.'],
    },
    {
      title: 'Children',
      paras: ['RentMaster is intended for adults. We do not knowingly collect personal information from anyone under 18. If you believe a child has given us information, contact us and we will remove it.'],
    },
    {
      title: 'Changes to this policy',
      paras: ['We may update this policy when our service or the law changes. The date at the top shows when it was last revised. If a change is significant, we will notify you in the app or by email before it takes effect.'],
    },
    {
      title: 'Contact and grievances',
      paras: ['For questions, requests or complaints about privacy, use the Contact page. Please include the email address of your account so we can verify your identity before acting on a request.'],
    },
  ],
}

export const TERMS: LegalDoc = {
  title: 'Terms and Conditions',
  updated: UPDATED,
  intro: 'These terms govern your use of RentMaster. By creating an account or using the platform, you agree to them. If you do not agree, please do not use the service.',
  sections: [
    {
      title: 'The service',
      paras: [
        'RentMaster provides software for recording and managing rental properties, tenancies, rent, agreements and maintenance. We are not a party to any tenancy between an owner and a tenant, and we do not act as a property agent, lawyer, accountant or tax adviser.',
        'Reports, reminders and calculations are tools to help you keep records. You remain responsible for checking them and for your own legal and tax compliance.',
      ],
    },
    {
      title: 'Accounts',
      bullets: [
        'You must be at least 18 years old and able to enter into a binding contract.',
        'You must provide accurate information and keep it up to date.',
        'You are responsible for activity under your account. Keep your password private and tell us promptly about any unauthorised use.',
        'Tenants register with the email address that an owner added to the tenancy. Accounts are personal and may not be shared.',
      ],
    },
    {
      title: 'Owner responsibilities',
      bullets: [
        'You must have the right to enter the property, tenant and payment information you add, and you are responsible for its accuracy.',
        'You are responsible for your rental terms, rent amounts, notices, deposits and compliance with tenancy, rent control, stamp duty, registration, tax and other laws that apply to you.',
        'Recording a rental agreement in RentMaster stores your details and a copy of the document. It does not make the agreement valid, registered or enforceable.',
        'You must handle your tenants’ personal information lawfully and only for managing the tenancy.',
      ],
    },
    {
      title: 'Tenant responsibilities',
      bullets: [
        'You must use your own account and provide accurate information in maintenance requests and messages.',
        'Rent, deposits and the terms of your tenancy are between you and your owner. RentMaster records them but does not decide disputes.',
      ],
    },
    {
      title: 'Payments',
      bullets: [
        'Owners can record payments received by cash, bank transfer, UPI or other methods. A recorded payment is the owner’s statement that money was received.',
        'Where online payment is available, it is processed by Razorpay under its own terms. An invoice is marked paid only after the gateway’s signed confirmation is verified on our server.',
        'RentMaster is not a bank or a payment institution. Refunds, chargebacks and disputes about rent are handled between the tenant, the owner and the payment gateway.',
      ],
    },
    {
      title: 'Plans and fees',
      paras: ['Some features may require a paid plan. Current plans and prices are shown on the Pricing page. We may change plans or prices with reasonable notice, and changes apply from the next billing period. Taxes are added where applicable.'],
    },
    {
      title: 'Acceptable use',
      paras: ['You agree not to:'],
      bullets: [
        'Break any law or infringe anyone’s rights.',
        'Attempt to access another user’s records, or probe, disrupt or bypass the security of the platform.',
        'Upload malicious files, or content that is unlawful, defamatory or abusive.',
        'Use the platform to send spam or harass others.',
        'Copy, resell or reverse engineer the service except where the law allows it.',
      ],
    },
    {
      title: 'Your data',
      paras: [
        'You keep ownership of the records and files you add. You give us permission to store, process and display them as needed to provide the service, as described in the Privacy Policy.',
        'You can export your reports as CSV files. Please keep your own backups of records you need.',
      ],
    },
    {
      title: 'Availability and changes',
      paras: ['We work to keep RentMaster available and accurate, but we do not guarantee uninterrupted or error-free operation. We may update, add or remove features. We will try to give notice of changes that significantly affect you.'],
    },
    {
      title: 'Suspension and termination',
      paras: ['You may stop using RentMaster at any time and ask us to close your account. We may suspend or end access if you break these terms, put the platform or other users at risk, or if the law requires. After closure, information is handled as described in the Privacy Policy.'],
    },
    {
      title: 'Disclaimers',
      paras: ['RentMaster is provided “as is” and “as available”. To the extent the law allows, we do not give any warranty that the service will meet your needs, that reports are free of errors or that information is suitable for any legal, tax or accounting purpose.'],
    },
    {
      title: 'Limitation of liability',
      paras: ['To the extent the law allows, RentMaster is not liable for indirect or consequential loss, loss of rent, profit or goodwill, or for disputes between owners and tenants. Our total liability for any claim relating to the service is limited to the fees you paid us in the 12 months before the claim arose. Nothing in these terms limits liability that cannot be limited by law.'],
    },
    {
      title: 'Governing law',
      paras: ['These terms are governed by the laws of India. Courts in India with proper jurisdiction will decide any dispute that cannot be resolved by discussion.'],
    },
    {
      title: 'Changes to these terms',
      paras: ['We may update these terms from time to time. The date at the top shows the latest version. If you keep using RentMaster after a change takes effect, you accept the updated terms.'],
    },
    {
      title: 'Contact',
      paras: ['Questions about these terms can be sent through the Contact page.'],
    },
  ],
}
