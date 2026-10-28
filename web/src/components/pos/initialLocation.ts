export interface LocationChoice { id: number; slug: string }
export const posLocationPreferenceKey = (userId: string) => `tsq-pos-location:${userId}`;

/** Saved choices are only honored when still authorized by this response. */
export function initialPOSLocation(locations: LocationChoice[], saved: string | null, defaultId?: number): number | undefined {
  const savedId = Number(saved);
  return locations.find(location => location.id === savedId)?.id
    ?? locations.find(location => location.id === defaultId)?.id
    ?? locations.find(location => location.slug === 'three-squares-main')?.id
    ?? locations[0]?.id;
}
