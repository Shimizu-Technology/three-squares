import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { Calendar, MapPin, Phone, Mail, ShoppingCart } from 'lucide-react';
import fundraiserPublicService, {
  type Fundraiser,
  type FundraiserProduct,
  type Participant,
} from '../../services/fundraiserPublicService';
import { FundraiserCartProvider, useFundraiserCart } from '../../contexts/FundraiserCartContext';
import FundraiserHero from '../../components/fundraiser/FundraiserHero';
import FundraiserSupportingBanner from '../../components/fundraiser/FundraiserSupportingBanner';
import FundraiserGoalProgress from '../../components/fundraiser/FundraiserGoalProgress';
import FundraiserProductGrid from '../../components/fundraiser/FundraiserProductGrid';

function FundraiserPageContent() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const participantCodeFromUrl = searchParams.get('p');

  const [fundraiser, setFundraiser] = useState<Fundraiser | null>(null);
  const [products, setProducts] = useState<FundraiserProduct[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { state, setFundraiser: setCartFundraiser, setParticipant, itemCount, subtotal } =
    useFundraiserCart();

  useEffect(() => {
    if (slug) {
      loadFundraiser();
    }
  }, [slug]);

  // Handle participant code from URL
  useEffect(() => {
    if (participantCodeFromUrl && participants.length > 0) {
      const participant = participants.find((p) => p.code === participantCodeFromUrl);
      if (participant) {
        setParticipant(participant.code, participant.display_name);
      }
    }
  }, [participantCodeFromUrl, participants]);

  const loadFundraiser = async () => {
    try {
      setLoading(true);
      const response = await fundraiserPublicService.getFundraiser(slug!);
      setFundraiser(response.fundraiser);
      setProducts(response.products);
      setParticipants(response.participants);
      setCartFundraiser(response.fundraiser.slug, response.fundraiser.id);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setError(error.response?.data?.error || 'Fundraiser not found');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-tsPrimary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (error || !fundraiser) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-warm-900 mb-2">Fundraiser Not Found</h1>
        <p className="text-warm-600 mb-4">{error}</p>
        <Link to="/" className="text-tsPrimary hover:underline">
          Return to Home
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-warm-50">
      {/* Hero */}
      <FundraiserHero fundraiser={fundraiser} />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Supporting Banner */}
        {state.participantName && (
          <div className="mb-6">
            <FundraiserSupportingBanner
              participantName={state.participantName}
              onClear={() => setParticipant(null, null)}
            />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Description */}
            {fundraiser.description && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">About This Fundraiser</h2>
                <p className="text-warm-700 whitespace-pre-wrap">{fundraiser.description}</p>
              </div>
            )}

            {/* Public Message */}
            {fundraiser.public_message && (
              <div className="bg-tsGold/10 border border-tsGold rounded-lg p-6">
                <p className="text-warm-800">{fundraiser.public_message}</p>
              </div>
            )}

            {/* Products */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Products</h2>
              <FundraiserProductGrid
                products={products}
                fundraiserSlug={slug!}
                canOrder={fundraiser.can_order}
              />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress */}
            {fundraiser.goal_amount_cents && (
              <FundraiserGoalProgress
                goalCents={fundraiser.goal_amount_cents}
                raisedCents={fundraiser.raised_amount_cents || 0}
                progressPercentage={fundraiser.progress_percentage}
              />
            )}

            {/* Dates */}
            {(fundraiser.start_date || fundraiser.end_date) && (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-2 text-warm-700">
                  <Calendar className="w-5 h-5" />
                  <span>
                    {fundraiser.start_date}
                    {fundraiser.end_date && ` - ${fundraiser.end_date}`}
                  </span>
                </div>
              </div>
            )}

            {/* Pickup Info */}
            {fundraiser.pickup_location && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Pickup Information</h3>
                <div className="flex items-start gap-2 text-warm-700 mb-2">
                  <MapPin className="w-5 h-5 mt-0.5 shrink-0" />
                  <span>{fundraiser.pickup_location}</span>
                </div>
                {fundraiser.pickup_instructions && (
                  <p className="text-sm text-warm-600 pl-7">
                    {fundraiser.pickup_instructions}
                  </p>
                )}
              </div>
            )}

            {/* Contact */}
            {(fundraiser.contact_name ||
              fundraiser.contact_email ||
              fundraiser.contact_phone) && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Contact</h3>
                {fundraiser.contact_name && (
                  <p className="text-warm-700 mb-2">{fundraiser.contact_name}</p>
                )}
                {fundraiser.contact_email && (
                  <a
                    href={`mailto:${fundraiser.contact_email}`}
                    className="flex items-center gap-2 text-tsPrimary hover:underline mb-2"
                  >
                    <Mail className="w-4 h-4" />
                    {fundraiser.contact_email}
                  </a>
                )}
                {fundraiser.contact_phone && (
                  <a
                    href={`tel:${fundraiser.contact_phone}`}
                    className="flex items-center gap-2 text-tsPrimary hover:underline"
                  >
                    <Phone className="w-4 h-4" />
                    {fundraiser.contact_phone}
                  </a>
                )}
              </div>
            )}

            {/* Participant Selection */}
            {participants.length > 0 && !state.participantCode && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="font-semibold mb-3">Support a Participant</h3>
                <select
                  onChange={(e) => {
                    const participant = participants.find(
                      (p) => p.id === Number(e.target.value)
                    );
                    if (participant) {
                      setParticipant(participant.code, participant.display_name);
                    }
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  defaultValue=""
                >
                  <option value="">Select a participant (optional)</option>
                  {participants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.display_name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Cart Button */}
      {itemCount > 0 && (
        <Link
          to={`/f/${slug}/cart`}
          className="fixed bottom-6 right-6 bg-tsPrimary text-white px-6 py-4 rounded-full shadow-lg hover:bg-primary-dark transition flex items-center gap-3 z-40"
        >
          <ShoppingCart className="w-6 h-6" />
          <span className="font-semibold">{itemCount} items</span>
          <span className="font-bold">{formatPrice(subtotal)}</span>
        </Link>
      )}
    </div>
  );
}

// Wrapper with provider
export default function FundraiserPage() {
  const { slug } = useParams<{ slug: string }>();

  return (
    <FundraiserCartProvider fundraiserSlug={slug}>
      <FundraiserPageContent />
    </FundraiserCartProvider>
  );
}
