import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Navigation shortcut with a stable icon/label region; never a command button. */
export function ActionTile({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode }) {
  return <Link to={to} className="ui-action-tile" data-ui-control="action-tile">
    <span className="ui-action-tile__icon" aria-hidden="true">{icon}</span>
    <span>{children}</span>
  </Link>;
}
