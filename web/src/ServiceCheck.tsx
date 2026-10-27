import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'
import { API_BASE_URL } from './config'
import { useBackendAvailability } from './hooks/useBackendAvailability'
import PausedPreviewPage from './pages/PausedPreviewPage'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY
const HEALTH_URL = `${API_BASE_URL.replace(/\/$/, '')}/health`

export function ServiceCheck() {
  const { status, retry } = useBackendAvailability(HEALTH_URL)

  if (status === 'checking') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-warm px-6 text-center" role="status">
        <div>
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-warm-200 border-t-tsPrimary" />
          <p className="mt-4 font-semibold text-warm-900">Checking online ordering…</p>
        </div>
      </main>
    )
  }

  if (status === 'unavailable') return <PausedPreviewPage onRetry={retry} />
  if (!PUBLISHABLE_KEY) throw new Error('Missing Clerk Publishable Key')

  return <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/"><App /></ClerkProvider>
}
