import { formatGuamDate } from '../utils/collectionSchedule';
import type { CollectionSchedule } from '../utils/collectionSchedule';

export default function CollectionScheduleNotice({ collection }: { collection: CollectionSchedule }) {
  const ended = collection.availability_status === 'ended';
  if (!ended && !collection.banner_text && !collection.starts_at && !collection.ends_at) return null;
  return (
    <div className="rounded-lg border border-warm-200 bg-white p-4 text-sm text-gray-800 space-y-2 break-words">
      {ended && <p className="font-semibold">This menu has ended. Ordering is closed.</p>}
      {collection.banner_text && <p>{collection.banner_text}</p>}
      {collection.starts_at && <p>From {formatGuamDate(collection.starts_at)}</p>}
      {collection.ends_at && <p>{ended ? 'Ended' : 'Until'} {formatGuamDate(collection.ends_at)}</p>}
    </div>
  );
}
