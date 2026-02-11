interface FundraiserGoalProgressProps {
  goalCents: number;
  raisedCents: number;
  progressPercentage: number;
}

export default function FundraiserGoalProgress({
  goalCents,
  raisedCents,
  progressPercentage,
}: FundraiserGoalProgressProps) {
  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="font-semibold mb-3">Fundraising Progress</h3>
      <div className="text-3xl font-bold text-tsPrimary mb-1">
        {formatPrice(raisedCents)}
      </div>
      <p className="text-sm text-warm-600 mb-3">
        raised of {formatPrice(goalCents)} goal
      </p>
      <div className="h-3 bg-warm-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(progressPercentage, 100)}%` }}
        />
      </div>
      <p className="text-sm text-warm-600 mt-2">
        {progressPercentage.toFixed(0)}% of goal
      </p>
    </div>
  );
}
