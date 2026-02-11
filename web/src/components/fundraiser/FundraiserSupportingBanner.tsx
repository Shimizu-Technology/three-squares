import { Heart } from 'lucide-react';

interface FundraiserSupportingBannerProps {
  participantName: string;
  onClear?: () => void;
}

export default function FundraiserSupportingBanner({
  participantName,
  onClear,
}: FundraiserSupportingBannerProps) {
  return (
    <div className="bg-tsGold/10 border border-tsGold rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-tsPrimary fill-tsPrimary" />
          <p className="text-warm-800">
            You're supporting:{' '}
            <span className="font-semibold">{participantName}</span>
          </p>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="text-sm text-warm-500 hover:text-warm-700 transition"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
