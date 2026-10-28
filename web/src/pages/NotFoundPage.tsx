import { Input } from '../components/ui/Input';
import { IconButton } from '../components/ui/IconButton';
import { Button } from '../components/ui/Button';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FadeIn from '../components/animations/FadeIn';

export default function NotFoundPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      navigate(`/products?search=${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-lg">
        <FadeIn direction="none">
          <div className="mb-8">
            <h1 className="text-8xl sm:text-9xl font-bold text-warm-200 tracking-tight select-none">
              404
            </h1>
            <div className="-mt-6 sm:-mt-8">
              <span className="text-4xl inline-block">
                <svg className="w-16 h-16 mx-auto text-warm-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
              </span>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={0.15}>
          <h2 className="text-2xl sm:text-3xl font-bold text-warm-900 mb-4 tracking-tight">
            Looks like you&apos;ve drifted off the island
          </h2>
        </FadeIn>

        <FadeIn delay={0.25}>
          <p className="text-lg text-warm-500 mb-8 leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            No worries — let&apos;s get you back to the good stuff!
          </p>
        </FadeIn>

        <FadeIn delay={0.3}>
          <form onSubmit={handleSearch} className="mb-10 max-w-sm mx-auto">
            <div className="flex gap-2">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="flex-1 min-w-0" aria-label="Search products"
              />
              <IconButton
                type="submit"

                aria-label="Search" variant="secondary"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </IconButton>
            </div>
          </form>
        </FadeIn>

        <FadeIn delay={0.35}>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              to="/"
              variant="secondary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Back to Home
            </Button>
            <Button
              to="/products"
              variant="secondary"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
              Browse Products
            </Button>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
