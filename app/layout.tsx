import type { Metadata } from 'next'
import './globals.css'
// Imported here rather than from the client component: a CSS import inside the client
// component produced a page-level chunk that 404s in dev, leaving the sidebar unstyled.
import '@copilotkit/react-ui/styles.css'

export const metadata: Metadata = {
  title: 'Graft',
  description: 'Self-maintaining APIs: detect, patch, prove, ship.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--ground)] text-[var(--ink)] antialiased">{children}</body>
    </html>
  )
}
