import { useBackendAvailability } from './useBackendAvailability';

export function useOrderingAvailability(action: 'checkout' | 'starting payment' = 'checkout') {
  const { status, config } = useBackendAvailability();
  const blocked = status !== 'available' || config?.online_ordering_paused !== false;
  const message = config?.online_ordering_paused
    ? config.online_ordering_pause_message?.trim() || 'Online ordering is paused.'
    : `We can’t reach ordering right now. Please retry the connection before ${action}.`;
  return { blocked, message };
}
