'use client';

import { useScheduleStore } from '../store/scheduleStore';
import { CheckCircle, XCircle, X } from 'lucide-react';

export function Toast() {
  const { toast, clearToast } = useScheduleStore();

  if (!toast) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-slide-in">
      <div className={`flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg ${
        toast.type === 'success' 
          ? 'bg-green-500/90 text-white' 
          : 'bg-red-500/90 text-white'
      }`}>
        {toast.type === 'success' ? (
          <CheckCircle className="w-5 h-5" />
        ) : (
          <XCircle className="w-5 h-5" />
        )}
        <span className="text-sm font-medium">{toast.message}</span>
        <button onClick={clearToast} className="p-1 hover:bg-white/20 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
