import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

export function ServiceCheck() {
  if (!PUBLISHABLE_KEY) throw new Error('Missing Clerk Publishable Key')
  return <ClerkProvider publishableKey={PUBLISHABLE_KEY} afterSignOutUrl="/"><App /></ClerkProvider>
}
