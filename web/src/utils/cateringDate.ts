// Match the API's Date.current calendar (Pacific/Guam) for its existing
// three-day event-date validation, wherever the customer browses from.
export function minCateringEventDate(now: Date = new Date()): string {
  const guamToday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Pacific/Guam', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const datePart = (type: string) => Number(guamToday.find(part => part.type === type)?.value);
  return new Date(Date.UTC(datePart('year'), datePart('month') - 1, datePart('day') + 3))
    .toISOString().slice(0, 10);
}
