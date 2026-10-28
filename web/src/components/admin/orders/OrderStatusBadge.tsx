import { StatusBadge } from '../../ui/StatusBadge';
import { orderStatus, type WorkflowAudience } from '../../ui/workflowStatus';

export function OrderStatusBadge({order, audience = 'staff'}: {order: Parameters<typeof orderStatus>[0]; audience?: WorkflowAudience}) {
  const status = orderStatus(order, audience);
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}
