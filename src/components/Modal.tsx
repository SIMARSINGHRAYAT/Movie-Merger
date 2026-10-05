import { useEffect, useMemo, useRef, type ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  const selector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute("disabled") && el.tabIndex !== -1
  );
};

export const Modal = ({ isOpen, onClose, title, children, className = "" }: ModalProps) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const labelId = useMemo(() => `modal-title-${Math.random().toString(36).slice(2, 8)}`, []);

  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;

    const previousFocused = document.activeElement as HTMLElement | null;
    const focusables = getFocusableElements(dialogRef.current);
    focusables[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;

      const nodes = getFocusableElements(dialogRef.current);
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocused?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className={`max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-white/15 bg-slate-950/95 p-5 text-slate-100 shadow-2xl shadow-cyan-950/40 ${className}`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 id={labelId} className="text-lg font-semibold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-white/20 px-2.5 py-1 text-sm hover:border-white/40"
            aria-label="Close dialog"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
