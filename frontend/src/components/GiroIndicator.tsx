import { cn } from '@/lib/utils';

interface GiroIndicatorProps {
  stockDays: number;
  warningDays: number;
  lowTurnoverDays: number;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function GiroIndicator({ stockDays, warningDays, lowTurnoverDays, showLabel = true, size = 'md' }: GiroIndicatorProps) {
  let color: string;
  let label: string;
  let bgColor: string;

  if (stockDays >= lowTurnoverDays) {
    color = 'bg-red-500';
    bgColor = 'bg-red-50 text-red-700 border-red-200';
    label = 'Giro Baixo';
  } else if (stockDays >= warningDays) {
    color = 'bg-yellow-500';
    bgColor = 'bg-yellow-50 text-yellow-700 border-yellow-200';
    label = 'Atencao';
  } else {
    color = 'bg-green-500';
    bgColor = 'bg-green-50 text-green-700 border-green-200';
    label = 'Normal';
  }

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  if (!showLabel) {
    return (
      <span className={cn('inline-block rounded-full', color, sizeClasses[size])} title={`${stockDays} dias - ${label}`} />
    );
  }

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
      bgColor
    )}>
      <span className={cn('inline-block rounded-full', color, sizeClasses['sm'])} />
      {label} ({Math.round(stockDays)}d)
    </span>
  );
}
