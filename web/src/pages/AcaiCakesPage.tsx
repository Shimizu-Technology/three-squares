import { useState, useEffect, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { 
  acaiApi, 
  configApi,
  formatPrice,
  type AcaiConfigResponse, 
  type AcaiAvailableDate, 
  type AcaiTimeSlot
} from '../services/api';
import type { AppConfig } from '../types/order';
import toast from 'react-hot-toast';
import FadeIn from '../components/animations/FadeIn';
import OptimizedImage from '../components/ui/OptimizedImage';

const DEFAULT_ACAI_GALLERY_IMAGE_A = '/images/acai-cake-set-a.webp';
const DEFAULT_ACAI_GALLERY_IMAGE_B = '/images/acai-cake-set-b.webp';
const DEFAULT_ACAI_GALLERY_HEADING = 'Featured Sets';
const DEFAULT_ACAI_GALLERY_SUBTEXT = 'Seasonal & special requests';

// Step configuration
type StepId = 'date' | 'time' | 'crust' | 'quantity' | 'placard' | 'contact';

interface Step {
  id: StepId;
  number: number;
  title: string;
  optional?: boolean;
}

// StepCard props interface
interface StepCardProps {
  step: Step;
  children: React.ReactNode;
  isActive: boolean;
  isComplete: boolean;
  isVisited: boolean;
  summary: string;
  canAccess: boolean;
  onStepClick: (stepId: StepId) => void;
}

// StepCard component - defined outside main component to prevent re-creation on each render
const StepCard = memo(function StepCard({ 
  step, 
  children, 
  isActive, 
  isComplete, 
  isVisited: _isVisited,
  summary,
  canAccess,
  onStepClick
}: StepCardProps) {
  void _isVisited; // Suppress unused variable warning
  return (
    <div 
      className={`rounded-2xl border-2 transition-all duration-300 overflow-hidden ${
        isActive 
          ? 'border-tsPrimary shadow-lg bg-white' 
          : isComplete 
            ? 'border-green-200 bg-green-50/50 hover:border-green-300 cursor-pointer' 
            : 'border-warm-100 bg-warm-50/50'
      }`}
    >
      {/* Step Header */}
      <button
        type="button"
        onClick={() => canAccess && onStepClick(step.id)}
        disabled={!canAccess}
        className={`w-full p-4 sm:p-5 flex items-center gap-4 text-left ${
          canAccess ? 'cursor-pointer' : 'cursor-not-allowed'
        }`}
      >
        {/* Step Number Badge */}
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-all ${
          isComplete 
            ? 'bg-green-500 text-white' 
            : isActive 
              ? 'bg-tsPrimary text-white shadow-md' 
              : 'bg-warm-200 text-warm-500'
        }`}>
          {isComplete && !isActive ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            step.number
          )}
        </div>

        {/* Step Title & Summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${isActive ? 'text-warm-900' : 'text-warm-700'}`}>
              {step.title}
            </span>
            {step.optional && (
              <span className="text-xs text-warm-400 font-normal">(Optional)</span>
            )}
          </div>
          {!isActive && summary && (
            <p className="text-sm text-warm-500 truncate mt-0.5">{summary}</p>
          )}
        </div>

        {/* Expand/Collapse Icon */}
        <div className={`shrink-0 transition-transform ${isActive ? 'rotate-180' : ''}`}>
          <svg className="w-5 h-5 text-warm-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Step Content */}
      <div className={`transition-all duration-300 ease-in-out ${
        isActive ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'
      }`}>
        <div className="px-4 sm:px-5 pb-5 pt-0">
          {children}
        </div>
      </div>
    </div>
  );
});

export default function AcaiCakesPage() {
  const navigate = useNavigate();
  const { getToken, isSignedIn } = useAuth();
  
  // Config state
  const [config, setConfig] = useState<AcaiConfigResponse | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Available dates and slots
  const [availableDates, setAvailableDates] = useState<AcaiAvailableDate[]>([]);
  const [timeSlots, setTimeSlots] = useState<AcaiTimeSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  
  // Form state
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [selectedCrust, setSelectedCrust] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [includePlacard, setIncludePlacard] = useState(false);
  const [selectedPlacardOption, setSelectedPlacardOption] = useState<number | null>(null);
  const [placardText, setPlacardText] = useState('');
  
  // Contact info
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  
  // Wizard state
  const [currentStep, setCurrentStep] = useState<StepId>('date');
  const [visitedSteps, setVisitedSteps] = useState<Set<StepId>>(new Set(['date'])); // Track which steps user has visited
  
  // Submission state
  const [submitting, setSubmitting] = useState(false);
  
  // Mark a step as visited
  const markStepVisited = (stepId: StepId) => {
    setVisitedSteps(prev => new Set([...prev, stepId]));
  };

  // Build steps array based on config
  const steps: Step[] = config ? [
    { id: 'date', number: 1, title: 'Pickup Date' },
    { id: 'time', number: 2, title: 'Pickup Time' },
    { id: 'crust', number: 3, title: 'Choose Crust' },
    { id: 'quantity', number: 4, title: 'Quantity' },
    ...(config.settings.placard_enabled && config.placard_options.length > 0 
      ? [{ id: 'placard' as StepId, number: 5, title: 'Message Placard', optional: true }] 
      : []),
    { id: 'contact', number: config.settings.placard_enabled && config.placard_options.length > 0 ? 6 : 5, title: 'Contact Info' },
  ] : [];

  // Check if a step has valid data (for form validation)
  const isStepDataValid = useCallback((stepId: StepId): boolean => {
    switch (stepId) {
      case 'date':
        return !!selectedDate;
      case 'time':
        return !!selectedSlot;
      case 'crust':
        return selectedCrust !== null;
      case 'quantity':
        return quantity >= 1;
      case 'placard':
        // Optional step - always "complete" for navigation purposes
        // But if they checked include, they need to select an option
        if (!includePlacard) return true;
        if (!selectedPlacardOption) return false;
        const placardOpt = config?.placard_options.find(p => p.id === selectedPlacardOption);
        if (placardOpt?.name?.toLowerCase().includes('custom') && !placardText.trim()) return false;
        return true;
      case 'contact':
        return name.trim() !== '' && email.trim() !== '' && phone.trim() !== '';
      default:
        return false;
    }
  }, [selectedDate, selectedSlot, selectedCrust, quantity, includePlacard, selectedPlacardOption, placardText, name, email, phone, config]);

  // Check if a step is complete (visited AND has valid data)
  const isStepComplete = useCallback((stepId: StepId): boolean => {
    // Step must be visited AND have valid data to show as complete
    return visitedSteps.has(stepId) && isStepDataValid(stepId);
  }, [visitedSteps, isStepDataValid]);

  // Get step summary text
  const getStepSummary = (stepId: StepId): string => {
    switch (stepId) {
      case 'date':
        if (!selectedDate) return '';
        const date = new Date(selectedDate + 'T00:00:00');
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      case 'time':
        if (!selectedSlot) return '';
        return selectedSlot.replace('-', ' - ').replace(/(\d{2}):(\d{2})/g, (_, h, m) => {
          const hour = parseInt(h);
          const period = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
          return `${hour12}:${m} ${period}`;
        });
      case 'crust':
        const crust = config?.crust_options.find(c => c.id === selectedCrust);
        return crust ? crust.name : '';
      case 'quantity':
        return `${quantity} cake${quantity > 1 ? 's' : ''}`;
      case 'placard':
        if (!includePlacard) return 'None';
        const placard = config?.placard_options.find(p => p.id === selectedPlacardOption);
        return placard ? placard.name : '';
      case 'contact':
        return name || '';
      default:
        return '';
    }
  };

  // Get next step
  const getNextStep = (currentStepId: StepId): StepId | null => {
    const currentIndex = steps.findIndex(s => s.id === currentStepId);
    if (currentIndex < steps.length - 1) {
      return steps[currentIndex + 1].id;
    }
    return null;
  };

  // Advance to next step (kept for future use)
  const _advanceToNextStep = useCallback(() => {
    const nextStep = getNextStep(currentStep);
    if (nextStep) {
      setCurrentStep(nextStep);
    }
  }, [currentStep, steps]);
  void _advanceToNextStep; // Suppress unused variable warning

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const [acaiConfig, appConf] = await Promise.all([
          acaiApi.getConfig(),
          configApi.getConfig()
        ]);
        setConfig(acaiConfig);
        setAppConfig(appConf);
        
        // Auto-select first crust option
        if (acaiConfig.crust_options.length > 0) {
          setSelectedCrust(acaiConfig.crust_options[0].id);
        }
        
        // Load available dates
        const datesResponse = await acaiApi.getAvailableDates(60);
        setAvailableDates(datesResponse.dates.filter(d => !d.fully_booked));
      } catch (err) {
        console.error('Failed to load Acai config:', err);
        setError('Unable to load ordering options. Please try again later.');
      } finally {
        setLoading(false);
      }
    };
    
    loadConfig();
  }, []);

  // Load time slots when date changes
  useEffect(() => {
    if (!selectedDate) {
      setTimeSlots([]);
      setSelectedSlot('');
      return;
    }
    
    const loadSlots = async () => {
      setLoadingSlots(true);
      try {
        const response = await acaiApi.getAvailableSlots(selectedDate);
        setTimeSlots(response.slots);
        setSelectedSlot('');
      } catch (err) {
        console.error('Failed to load time slots:', err);
        toast.error('Unable to load time slots for this date');
      } finally {
        setLoadingSlots(false);
      }
    };
    
    loadSlots();
  }, [selectedDate]);

  // Calculate total price
  const calculateTotal = () => {
    if (!config) return 0;
    
    let total = config.settings.base_price_cents * quantity;
    
    // Add crust price
    const crust = config.crust_options.find(c => c.id === selectedCrust);
    if (crust) {
      total += crust.price_cents * quantity;
    }
    
    // Add placard price
    if (includePlacard && selectedPlacardOption) {
      const placardOption = config.placard_options.find(p => p.id === selectedPlacardOption);
      if (placardOption) {
        total += placardOption.price_cents * quantity;
      }
    }
    
    return total;
  };

  // Get selected placard option details
  const selectedPlacardOptionDetails = config?.placard_options.find(p => p.id === selectedPlacardOption);
  const isCustomPlacard = selectedPlacardOptionDetails?.name?.toLowerCase().includes('custom');

  // Form validation
  const isFormValid = () => {
    // For form submission, we just need all data to be valid (not necessarily "visited")
    return steps.every(step => isStepDataValid(step.id));
  };

  // Submit order
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isFormValid() || !config) return;
    
    setSubmitting(true);
    setError(null);
    
    try {
      let token: string | null = null;
      if (isSignedIn) {
        token = await getToken();
      }
      
      const response = await acaiApi.createOrder({
        pickup_date: selectedDate,
        pickup_time: selectedSlot,
        crust_option_id: selectedCrust!,
        name,
        email,
        phone,
        quantity,
        include_placard: includePlacard,
        placard_option_id: includePlacard ? selectedPlacardOption || undefined : undefined,
        placard_text: includePlacard ? placardText : undefined,
        notes: notes || undefined,
      }, token);
      
      if (response.success) {
        toast.success('Order placed successfully!');
        navigate(`/orders/${response.order.id}?email=${encodeURIComponent(email)}`);
      }
    } catch (err: any) {
      console.error('Order failed:', err);
      const message = err.response?.data?.error || 'Failed to place order. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle date selection with auto-advance
  const handleDateSelect = (date: string) => {
    setSelectedDate(date);
    // Auto-advance after short delay for visual feedback
    setTimeout(() => {
      setCurrentStep('time');
      markStepVisited('time');
    }, 300);
  };

  // Handle time selection with auto-advance
  const handleTimeSelect = (slot: string) => {
    setSelectedSlot(slot);
    setTimeout(() => {
      setCurrentStep('crust');
      markStepVisited('crust');
    }, 300);
  };

  // Handle crust selection with auto-advance
  const handleCrustSelect = (crustId: number) => {
    setSelectedCrust(crustId);
    setTimeout(() => {
      setCurrentStep('quantity');
      markStepVisited('quantity');
    }, 300);
  };

  // Handler for step card clicks - memoized to prevent re-renders
  // NOTE: Must be before any early returns to satisfy Rules of Hooks
  const handleStepClick = useCallback((stepId: StepId) => {
    setCurrentStep(stepId);
    markStepVisited(stepId);
  }, [markStepVisited]);

  if (loading) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-tsPrimary mx-auto mb-4"></div>
          <p className="text-warm-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!config || !config.settings.active) {
    return (
      <div className="min-h-screen bg-warm-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <div className="mb-4"><svg className="w-16 h-16 mx-auto text-purple-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.126-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12" /></svg></div>
          <h1 className="text-2xl font-bold text-warm-900 mb-2">Acai Cakes Coming Soon!</h1>
          <p className="text-warm-600 mb-6">
            We're not currently accepting Acai Cake orders online. 
            Please call us to place an order!
          </p>
          <a 
            href={`tel:${config?.settings.pickup_phone || appConfig?.store_info?.phone || '671-777-1234'}`}
            className="inline-block bg-tsPrimary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-dark transition"
          >
            Call to Order
          </a>
        </div>
      </div>
    );
  }

  const selectedCrustOption = config.crust_options.find(c => c.id === selectedCrust);
  const completedStepsCount = steps.filter(s => isStepComplete(s.id)).length;
  const progressPercent = (completedStepsCount / steps.length) * 100;
  const showGalleryImageA = appConfig?.acai_gallery_show_image_a ?? true;
  const showGalleryImageB = appConfig?.acai_gallery_show_image_b ?? true;

  // Helper to get step card props
  const getStepCardProps = (step: Step) => {
    const stepIndex = steps.findIndex(s => s.id === step.id);
    return {
      step,
      isActive: currentStep === step.id,
      isComplete: isStepComplete(step.id),
      isVisited: visitedSteps.has(step.id),
      summary: visitedSteps.has(step.id) ? getStepSummary(step.id) : '',
      canAccess: stepIndex === 0 || steps.slice(0, stepIndex).every(s => isStepComplete(s.id)),
      onStepClick: handleStepClick,
    };
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero Header */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #FDF8F6 0%, #FEF3EE 50%, #FDF8F6 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-red-100/30 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-orange-100/30 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
        
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <FadeIn>
            {config.settings.image_url ? (
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div className="order-1">
                  <img
                    src={config.settings.image_url}
                    alt={config.settings.name}
                    className="w-full max-w-sm mx-auto rounded-2xl shadow-xl"
                    loading="lazy"
                  />
                </div>
                <div className="order-2 text-center md:text-left">
                  <span className="inline-block text-sm font-medium text-tsPrimary uppercase tracking-wider mb-2">
                    Order Fresh
                  </span>
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 text-warm-900">
                    {config.settings.name}
                  </h1>
                  <p className="text-3xl font-bold mb-3 text-tsPrimary">
                    {config.settings.formatted_price}
                  </p>
                  {config.settings.description && (
                    <p className="max-w-xl whitespace-pre-line text-warm-600 leading-relaxed text-sm">
                      {config.settings.description}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center max-w-2xl mx-auto">
                <span className="inline-block text-sm font-medium text-tsPrimary uppercase tracking-wider mb-2">
                  Order Fresh
                </span>
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold mb-3 text-warm-900">
                  {config.settings.name}
                </h1>
                <p className="text-3xl font-bold mb-3 text-tsPrimary">
                  {config.settings.formatted_price}
                </p>
                {config.settings.description && (
                  <p className="max-w-xl mx-auto whitespace-pre-line text-warm-600 leading-relaxed text-sm">
                    {config.settings.description}
                  </p>
                )}
              </div>
            )}
          </FadeIn>
        </div>
      </div>

      {/* Gallery */}
      {(showGalleryImageA || showGalleryImageB) && (
        <div className="bg-white">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
            <FadeIn>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl sm:text-2xl font-semibold text-warm-900">
                  {appConfig?.acai_gallery_heading || DEFAULT_ACAI_GALLERY_HEADING}
                </h2>
                <span className="text-xs sm:text-sm text-warm-500">
                  {appConfig?.acai_gallery_subtext || DEFAULT_ACAI_GALLERY_SUBTEXT}
                </span>
              </div>
              {(() => {
                const galleryItems = [
                  showGalleryImageA && {
                    src: appConfig?.acai_gallery_image_a_url || DEFAULT_ACAI_GALLERY_IMAGE_A,
                    alt: 'Acai cake set A',
                  },
                  showGalleryImageB && {
                    src: appConfig?.acai_gallery_image_b_url || DEFAULT_ACAI_GALLERY_IMAGE_B,
                    alt: 'Acai cake set B',
                  },
                ].filter(Boolean) as Array<{ src: string; alt: string }>;

                const isSingle = galleryItems.length === 1;

                return (
                  <div className={`grid grid-cols-1 ${isSingle ? 'sm:grid-cols-1' : 'sm:grid-cols-2'} gap-5`}>
                    {galleryItems.map((item, index) => (
                      <div
                        key={index}
                        className={`rounded-2xl border border-warm-100 overflow-hidden shadow-sm bg-white ${
                          isSingle ? 'sm:max-w-[520px] sm:mx-auto w-full' : ''
                        }`}
                      >
                        <OptimizedImage
                          src={item.src}
                          alt={item.alt}
                          context="card"
                          className="w-full h-64 sm:h-72 object-cover"
                        />
                      </div>
                    ))}
                  </div>
                );
              })()}
            </FadeIn>
          </div>
        </div>
      )}

      {/* Progress Bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-warm-100 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-warm-100 rounded-full overflow-hidden">
              <div 
                className="h-full bg-tsPrimary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium text-warm-500 whitespace-nowrap">
              {completedStepsCount}/{steps.length}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Test Mode Banner */}
        {appConfig?.app_mode === 'test' && (
          <div className="mb-6 bg-yellow-50 border-2 border-yellow-300 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-center">
              <span className="text-yellow-800 font-medium">
                Test Mode — No real payment will be charged
              </span>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Step 1: Select Date */}
          <StepCard {...getStepCardProps(steps.find(s => s.id === 'date')!)}>
            {availableDates.length === 0 ? (
              <p className="text-warm-500 italic">No available pickup dates at this time.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {availableDates.slice(0, 12).map((dateInfo) => {
                  const date = new Date(dateInfo.date + 'T00:00:00');
                  const isSelected = selectedDate === dateInfo.date;
                  
                  return (
                    <button
                      key={dateInfo.date}
                      type="button"
                      onClick={() => handleDateSelect(dateInfo.date)}
                      className={`p-3 rounded-xl border-2 transition text-center ${
                        isSelected
                          ? 'border-tsPrimary bg-red-50 shadow-sm'
                          : 'border-warm-200 hover:border-warm-300 hover:bg-warm-50'
                      }`}
                    >
                      <div className="text-xs text-warm-500 uppercase tracking-wide">{dateInfo.day_name}</div>
                      <div className="text-lg font-bold text-warm-900 mt-1">
                        {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      <div className="text-xs text-green-600 mt-1 font-medium">
                        {dateInfo.available_slots} slots
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </StepCard>

          {/* Step 2: Select Time */}
          <StepCard {...getStepCardProps(steps.find(s => s.id === 'time')!)}>
            {!selectedDate ? (
              <p className="text-warm-500 italic">Please select a date first.</p>
            ) : loadingSlots ? (
              <div className="text-center py-6">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-tsPrimary mx-auto"></div>
              </div>
            ) : timeSlots.length === 0 ? (
              <p className="text-warm-500 italic">No time slots available for this date.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {timeSlots.map((slot) => {
                  const isSelected = selectedSlot === slot.slot_value;
                  
                  return (
                    <button
                      key={slot.slot_value}
                      type="button"
                      disabled={!slot.available}
                      onClick={() => handleTimeSelect(slot.slot_value)}
                      className={`p-3 rounded-xl border-2 transition ${
                        !slot.available
                          ? 'border-warm-200 bg-warm-100 text-warm-400 cursor-not-allowed'
                          : isSelected
                          ? 'border-tsPrimary bg-red-50 text-warm-900 shadow-sm'
                          : 'border-warm-200 hover:border-warm-300 hover:bg-warm-50 text-warm-900'
                      }`}
                    >
                      <div className="font-semibold">{slot.time}</div>
                      {!slot.available && (
                        <div className="text-xs text-warm-400">Fully booked</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </StepCard>

          {/* Step 3: Choose Crust */}
          <StepCard {...getStepCardProps(steps.find(s => s.id === 'crust')!)}>
            <div className="space-y-2">
              {config.crust_options.map((crust) => {
                const isSelected = selectedCrust === crust.id;
                
                return (
                  <button
                    key={crust.id}
                    type="button"
                    onClick={() => handleCrustSelect(crust.id)}
                    className={`w-full p-4 rounded-xl border-2 transition text-left flex items-center gap-4 ${
                      isSelected
                        ? 'border-tsPrimary bg-red-50 shadow-sm'
                        : 'border-warm-200 hover:border-warm-300 hover:bg-warm-50'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      isSelected ? 'border-tsPrimary bg-tsPrimary' : 'border-warm-300'
                    }`}>
                      {isSelected && (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-warm-900">{crust.name}</div>
                      {crust.description && (
                        <div className="text-sm text-warm-500 mt-0.5">{crust.description}</div>
                      )}
                    </div>
                    <div className={`font-medium shrink-0 ${crust.price_cents > 0 ? 'text-tsPrimary' : 'text-green-600'}`}>
                      {crust.formatted_price}
                    </div>
                  </button>
                );
              })}
            </div>
          </StepCard>

          {/* Step 4: Quantity */}
          <StepCard {...getStepCardProps(steps.find(s => s.id === 'quantity')!)}>
            <div className="flex items-center justify-center gap-6 py-4">
              <button
                type="button"
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-14 h-14 rounded-full border-2 border-warm-300 flex items-center justify-center text-2xl font-bold hover:border-tsPrimary hover:text-tsPrimary transition"
              >
                −
              </button>
              <span className="text-4xl font-bold text-warm-900 w-20 text-center">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity(Math.min(10, quantity + 1))}
                className="w-14 h-14 rounded-full border-2 border-warm-300 flex items-center justify-center text-2xl font-bold hover:border-tsPrimary hover:text-tsPrimary transition"
              >
                +
              </button>
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  const nextStep = config.settings.placard_enabled && config.placard_options.length > 0 ? 'placard' : 'contact';
                  setCurrentStep(nextStep);
                  markStepVisited(nextStep);
                }}
                className="inline-flex items-center gap-2 text-sm font-medium text-tsPrimary hover:text-red-700 transition"
              >
                Continue
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </StepCard>

          {/* Step 5: Placard (Optional) */}
          {config.settings.placard_enabled && config.placard_options.length > 0 && (
            <StepCard {...getStepCardProps(steps.find(s => s.id === 'placard')!)}>
              <div className="space-y-4">
                <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border-2 border-warm-200 hover:border-warm-300 transition">
                  <input
                    type="checkbox"
                    checked={includePlacard}
                    onChange={(e) => {
                      setIncludePlacard(e.target.checked);
                      if (!e.target.checked) {
                        setSelectedPlacardOption(null);
                        setPlacardText('');
                      }
                    }}
                    className="w-5 h-5 text-tsPrimary border-warm-300 rounded focus:ring-tsPrimary"
                  />
                  <span className="text-warm-700 font-medium">
                    Yes, add a message placard
                  </span>
                </label>
                
                {includePlacard && (
                  <div className="space-y-4 pl-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {config.placard_options.map((placard) => {
                        const isSelected = selectedPlacardOption === placard.id;
                        
                        return (
                          <button
                            key={placard.id}
                            type="button"
                            onClick={() => {
                              setSelectedPlacardOption(placard.id);
                              if (!placard.name.toLowerCase().includes('custom')) {
                                setPlacardText(placard.name);
                              } else {
                                setPlacardText('');
                              }
                            }}
                            className={`p-3 rounded-xl border-2 transition text-left ${
                              isSelected
                                ? 'border-tsPrimary bg-red-50'
                                : 'border-warm-200 hover:border-warm-300'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div className="font-medium text-warm-900">{placard.name}</div>
                              <div className="text-sm text-warm-600">{placard.formatted_price}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedPlacardOption && (
                      <div>
                        <label className="block text-sm font-medium text-warm-700 mb-1">
                          {isCustomPlacard ? 'Your Custom Message *' : 'Personalize Your Message (Optional)'}
                        </label>
                        <input
                          type="text"
                          value={placardText}
                          onChange={(e) => setPlacardText(e.target.value)}
                          placeholder={isCustomPlacard ? 'Enter your custom message' : `e.g., ${selectedPlacardOptionDetails?.name} to Mom!`}
                          maxLength={50}
                          className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                        />
                        <p className="text-xs text-warm-500 mt-1">{placardText.length}/50 characters</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => { setCurrentStep('contact'); markStepVisited('contact'); }}
                    className="inline-flex items-center gap-2 text-sm font-medium text-tsPrimary hover:text-red-700 transition"
                  >
                    Continue
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </StepCard>
          )}

          {/* Step 6: Contact Information */}
          <StepCard {...getStepCardProps(steps.find(s => s.id === 'contact')!)}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-warm-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="you@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-warm-700 mb-1">Phone *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="(671) 123-4567"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-warm-700 mb-1">Special Instructions (Optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 border border-warm-300 rounded-xl focus:ring-2 focus:ring-tsPrimary focus:border-transparent"
                  placeholder="Any special requests..."
                />
              </div>
            </div>
          </StepCard>

          {/* Order Summary - Always Visible */}
          <div className="bg-white rounded-2xl shadow-lg border border-warm-200 p-5 sm:p-6">
            <h2 className="text-lg font-bold text-warm-900 mb-4 flex items-center">
              <svg className="w-5 h-5 text-warm-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Order Summary
            </h2>
            
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-warm-600">{config.settings.name} × {quantity}</span>
                <span className="text-warm-900 font-medium">{formatPrice(config.settings.base_price_cents * quantity)}</span>
              </div>
              
              {selectedCrustOption && selectedCrustOption.price_cents > 0 && (
                <div className="flex justify-between">
                  <span className="text-warm-600">{selectedCrustOption.name} × {quantity}</span>
                  <span className="text-warm-900 font-medium">{formatPrice(selectedCrustOption.price_cents * quantity)}</span>
                </div>
              )}
              
              {includePlacard && selectedPlacardOptionDetails && selectedPlacardOptionDetails.price_cents > 0 && (
                <div className="flex justify-between">
                  <span className="text-warm-600">{selectedPlacardOptionDetails.name} × {quantity}</span>
                  <span className="text-warm-900 font-medium">{formatPrice(selectedPlacardOptionDetails.price_cents * quantity)}</span>
                </div>
              )}
              
              <div className="border-t border-warm-200 pt-3 mt-3">
                <div className="flex justify-between text-lg font-bold">
                  <span className="text-warm-900">Total</span>
                  <span className="text-tsPrimary">{formatPrice(calculateTotal())}</span>
                </div>
              </div>
            </div>

            {selectedDate && selectedSlot && (
              <div className="mt-4 p-3 bg-blue-50 rounded-xl text-xs text-warm-700 border border-blue-100">
                <div className="flex items-center gap-2 mb-1">
                  <svg className="w-3.5 h-3.5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at {getStepSummary('time')}
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-tsPrimary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {config.settings.pickup_location}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-700">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid() || submitting}
            className="w-full bg-tsPrimary text-white py-4 px-6 rounded-2xl font-bold text-lg hover:bg-primary-dark transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center shadow-xl"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-3"></div>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Place Order — {formatPrice(calculateTotal())}
              </>
            )}
          </button>

          {/* Phone Order Alternative */}
          <div className="text-center py-4">
            <p className="text-warm-500 text-sm mb-1">Prefer to order by phone?</p>
            <a 
              href={`tel:${config.settings.pickup_phone}`}
              className="inline-flex items-center gap-2 text-tsPrimary font-semibold hover:text-red-700 transition text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Call {config.settings.pickup_phone}
            </a>
          </div>
        </form>
      </div>
    </div>
  );
}
