import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ServiceWorker } from '@/components/ServiceWorker'
import { ThemeSync } from '@/components/ui/ThemeSync'
import { PAGE_COLOR } from '@/lib/design/theme'

export const metadata: Metadata = {
  title: { default: 'homedocs', template: '%s · homedocs' },
  applicationName: 'homedocs',
  appleWebApp: { capable: true, title: 'homedocs', statusBarStyle: 'default' },
  // Private family data: nothing here belongs in a search engine.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: PAGE_COLOR.light },
    { media: '(prefers-color-scheme: dark)', color: PAGE_COLOR.dark },
  ],
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    /* suppressHydrationWarning: the theme script sets `data-theme` on this
       element before React hydrates it, on purpose. It covers this element's
       own attributes only. */
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        {/* First: inserts the head script that applies a stored Light or Dark
            before first paint (lib/design/theme.ts). */}
        <ThemeSync />
        {children}
        <ServiceWorker />
      </body>
    </html>
  )
}
