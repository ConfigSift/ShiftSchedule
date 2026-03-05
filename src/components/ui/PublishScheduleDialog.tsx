'use client';

import { Modal } from '../Modal';

export type PublishEmailMode = 'all' | 'changed' | 'none';

type PublishScheduleDialogProps = {
  open: boolean;
  selectedMode: PublishEmailMode;
  isLoading?: boolean;
  onModeChange: (mode: PublishEmailMode) => void;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
};

export function PublishScheduleDialog({
  open,
  selectedMode,
  isLoading = false,
  onModeChange,
  onCancel,
  onConfirm,
}: PublishScheduleDialogProps) {
  return (
    <Modal
      isOpen={open}
      onClose={isLoading ? () => {} : onCancel}
      title="Publish schedule?"
      size="sm"
      mobileFullScreen={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-theme-muted">Notify employees by email?</p>

        <fieldset className="space-y-2" aria-label="Publish email options">
          <label className="flex items-start gap-2 rounded-md border border-theme-primary px-3 py-2 hover:bg-theme-hover">
            <input
              type="radio"
              name="publish-email-mode"
              className="mt-0.5"
              checked={selectedMode === 'all'}
              onChange={() => onModeChange('all')}
              disabled={isLoading}
            />
            <span className="text-sm text-theme-primary">Email everyone on this schedule</span>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-theme-primary px-3 py-2 hover:bg-theme-hover">
            <input
              type="radio"
              name="publish-email-mode"
              className="mt-0.5"
              checked={selectedMode === 'changed'}
              onChange={() => onModeChange('changed')}
              disabled={isLoading}
            />
            <span className="text-sm text-theme-primary">Email only employees whose shifts changed</span>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-theme-primary px-3 py-2 hover:bg-theme-hover">
            <input
              type="radio"
              name="publish-email-mode"
              className="mt-0.5"
              checked={selectedMode === 'none'}
              onChange={() => onModeChange('none')}
              disabled={isLoading}
            />
            <span className="text-sm text-theme-primary">Don&apos;t send email</span>
          </label>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-2 rounded-md border border-theme-primary text-sm text-theme-secondary hover:bg-theme-hover disabled:opacity-60"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors disabled:cursor-not-allowed disabled:bg-amber-500/70"
            onClick={() => {
              void onConfirm();
            }}
            disabled={isLoading}
          >
            {isLoading ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
