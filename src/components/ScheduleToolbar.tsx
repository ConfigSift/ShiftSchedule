'use client';

import type { ReactNode } from 'react';
import { ScheduleDateControl } from './ScheduleDateControl';
import type { WeekStartDay } from '../types';

type ScheduleToolbarProps = {
  viewMode: 'day' | 'week' | 'month';
  selectedDate: Date;
  weekStartDay: WeekStartDay;
  isToday: boolean;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectDate: (date: Date) => void;
  onPrevJump?: () => void;
  onNextJump?: () => void;
  rightActions?: ReactNode;
  rightActionsWidthClass?: string;
};

export function ScheduleToolbar({
  viewMode,
  selectedDate,
  weekStartDay,
  isToday,
  onToday,
  onPrev,
  onNext,
  onSelectDate,
  onPrevJump,
  onNextJump,
  rightActions,
  rightActionsWidthClass = 'w-[320px]',
}: ScheduleToolbarProps) {
  return (
    <div className="shrink-0 border-b border-theme-primary bg-theme-secondary/95 backdrop-blur px-2 sm:px-4 py-2 sm:h-14 overflow-x-auto">
      <div className="grid grid-cols-[140px_minmax(0,1fr)_320px] items-center gap-2 min-w-max">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToday}
            disabled={isToday}
            className={`w-[100px] h-[40px] rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              isToday
                ? 'bg-theme-tertiary text-theme-muted cursor-not-allowed'
                : 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20'
            }`}
          >
            Today
          </button>
        </div>

        <div className="flex items-center justify-center">
          <ScheduleDateControl
            viewMode={viewMode}
            selectedDate={selectedDate}
            weekStartDay={weekStartDay}
            onSelectDate={onSelectDate}
            onPrev={onPrev}
            onNext={onNext}
            onPrevJump={onPrevJump}
            onNextJump={onNextJump}
          />
        </div>

        <div className="flex items-center justify-end">
          <div className={`${rightActionsWidthClass} flex items-center justify-end gap-2`}>
            {rightActions ?? <div className="h-[40px] w-full" />}
          </div>
        </div>
      </div>
    </div>
  );
}
