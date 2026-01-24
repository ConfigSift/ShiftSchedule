'use client';

import { useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** If true, modal goes full-screen on mobile */
  mobileFullScreen?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md',
  mobileFullScreen = true,
}: ModalProps) {
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleEscape]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'sm:max-w-sm',
    md: 'sm:max-w-md',
    lg: 'sm:max-w-lg',
    xl: 'sm:max-w-2xl',
  };

  const mobileClasses = mobileFullScreen
    ? 'h-[100dvh] w-full sm:h-auto sm:max-h-[90vh] sm:w-full sm:mx-4 rounded-none sm:rounded-2xl'
    : 'max-h-[90vh] w-full mx-4 rounded-2xl';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-safe:transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />
      
      <div 
        className={`relative ${mobileClasses} ${sizeClasses[size]} bg-theme-secondary shadow-2xl border-0 sm:border border-theme-primary motion-safe:animate-slide-in overflow-hidden flex flex-col`}
      >
        <div className="flex items-center justify-between p-4 border-b border-theme-primary shrink-0">
          <h2 id="modal-title" className="text-lg font-semibold text-theme-primary">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-1 rounded-lg hover:bg-theme-hover text-theme-tertiary hover:text-theme-primary transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
