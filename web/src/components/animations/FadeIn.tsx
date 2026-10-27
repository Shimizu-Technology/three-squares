interface FadeInProps {
  children: React.ReactNode;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
  duration?: number;
  className?: string;
  immediate?: boolean;
}

// Preserve existing layout wrappers while removing repeated scroll reveals.
export default function FadeIn({ children, className = '' }: FadeInProps) {
  return <div className={className}>{children}</div>;
}
