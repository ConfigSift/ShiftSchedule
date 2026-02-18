import { AlertTriangle, Info } from 'lucide-react';

type Props = {
  variant?: 'info' | 'warning';
  message: string;
};

export function AdminBanner({ variant = 'info', message }: Props) {
  const styles =
    variant === 'warning'
      ? 'border-amber-200 bg-amber-50 text-amber-800'
      : 'border-blue-200 bg-blue-50 text-blue-800';
  const Icon = variant === 'warning' ? AlertTriangle : Info;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}
