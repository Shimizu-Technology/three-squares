import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  FolderOpen,
  Warehouse,
  Heart,
  IceCreamCone,
  Users,
  Upload,
  Settings,
  Sliders,
  Plus,
  ClipboardList,
  DollarSign,
  Clock,
  ShoppingBag,
  TrendingUp,
  BarChart3,
  UtensilsCrossed,
  MapPin,
  type LucideIcon,
} from 'lucide-react';

// Central icon registry for all admin navigation and UI elements.
// Add new icons here instead of scattering emoji/strings across pages.
export const ADMIN_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  orders: ShoppingCart,
  products: Package,
  collections: FolderOpen,
  locations: MapPin,
  inventory: Warehouse,
  fundraisers: Heart,
  acai: IceCreamCone,
  catering: UtensilsCrossed,
  users: Users,
  import: Upload,
  settings: Settings,
  presets: Sliders,
  add: Plus,
  'clipboard-list': ClipboardList,
  revenue: DollarSign,
  pending: Clock,
  'shopping-bag': ShoppingBag,
  trending: TrendingUp,
  analytics: BarChart3,
};

interface AdminIconProps {
  name: string;
  className?: string;
  size?: number;
}

/**
 * Render a Lucide icon by its registry name.
 * Falls back to a neutral dot if the name isn't mapped.
 */
export default function AdminIcon({ name, className = 'w-5 h-5', size }: AdminIconProps) {
  const Icon = ADMIN_ICONS[name];
  if (!Icon) {
    return <span className={className} />;
  }
  return <Icon className={className} size={size} />;
}
