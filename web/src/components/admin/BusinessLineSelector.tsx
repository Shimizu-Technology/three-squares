import { BUSINESS_LINES, useBusinessLineStore } from '../../store/businessLineStore';

export default function BusinessLineSelector() {
  const { selected, setSelected } = useBusinessLineStore();

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {BUSINESS_LINES.map((bl) => {
        const isActive = selected === bl.value;
        return (
          <button
            key={bl.value}
            onClick={() => setSelected(bl.value)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              isActive
                ? `${bl.activeColor} text-white shadow-sm`
                : `${bl.color} ${bl.textColor} hover:opacity-80`
            }`}
          >
            {bl.shortLabel}
          </button>
        );
      })}
    </div>
  );
}
