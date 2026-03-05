'use client';

import { Modal } from '../Modal';

type PasteJobPickerDialogProps = {
  open: boolean;
  employeeName: string;
  options: string[];
  selectedJob: string;
  onSelectJob: (job: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function PasteJobPickerDialog({
  open,
  employeeName,
  options,
  selectedJob,
  onSelectJob,
  onCancel,
  onConfirm,
}: PasteJobPickerDialogProps) {
  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title="Select job for this shift"
      size="sm"
      mobileFullScreen={false}
    >
      <div className="space-y-4">
        <div className="text-sm text-theme-muted">
          This employee has multiple jobs.
          {employeeName ? <span className="block mt-1 text-theme-tertiary">{employeeName}</span> : null}
        </div>

        <fieldset className="space-y-2" aria-label="Paste job options">
          {options.map((option) => (
            <label
              key={option}
              className="flex items-start gap-2 rounded-md border border-theme-primary px-3 py-2 hover:bg-theme-hover"
            >
              <input
                type="radio"
                name="paste-job-option"
                className="mt-0.5"
                checked={selectedJob === option}
                onChange={() => onSelectJob(option)}
              />
              <span className="text-sm text-theme-primary">{option}</span>
            </label>
          ))}
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-2 rounded-md border border-theme-primary text-sm text-theme-secondary hover:bg-theme-hover"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-2 rounded-md text-sm font-semibold bg-amber-500 text-zinc-900 hover:bg-amber-400 transition-colors disabled:cursor-not-allowed disabled:bg-amber-500/70"
            disabled={!selectedJob}
            onClick={onConfirm}
          >
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
}
