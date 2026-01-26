import { useEffect, useRef } from 'react';

const Modal = ({ open, title, children, onClose, onConfirm, confirmLabel = 'Confirm', confirmClass = 'bg-red-600 text-white', cancelLabel = 'Cancel' }) => {
  const modalRef = useRef(null);
  const confirmRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return;
    // save previously focused element to restore on close
    previouslyFocused.current = document.activeElement;
    // focus the modal container for screen readers
    setTimeout(() => {
      // focus the confirm button if present, else first focusable
      const target = confirmRef.current || modalRef.current?.querySelector('button, [tabindex]:not([tabindex="-1"])');
      if (target && typeof target.focus === 'function') target.focus();
    }, 0);

    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose && onClose();
      }
      if (e.key === 'Tab') {
        // simple focus trap
        const focusable = modalRef.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusable || focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { last.focus(); e.preventDefault(); }
        } else {
          if (document.activeElement === last) { first.focus(); e.preventDefault(); }
        }
      }
    };

    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      // restore focus
      try { previouslyFocused.current && previouslyFocused.current.focus && previouslyFocused.current.focus(); } catch (e) { /* ignore focus restore errors */ }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" aria-hidden={!open}>
      <div className="absolute inset-0 bg-black opacity-40 transition-opacity" onClick={onClose} />
      <div ref={modalRef} role="dialog" aria-modal="true" aria-label={title || 'Modal'} className="bg-white rounded shadow-lg z-50 w-11/12 max-w-lg p-4 transform transition-all duration-200 scale-100" tabIndex={-1}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="mb-4">{children}</div>
        <div className="flex justify-end space-x-2">
          <button onClick={onClose} className="px-3 py-1 border rounded hover:bg-gray-50">{cancelLabel}</button>
          {onConfirm && <button ref={confirmRef} onClick={onConfirm} className={`px-3 py-1 rounded ${confirmClass} hover:opacity-90`}>{confirmLabel}</button>}
        </div>
      </div>
    </div>
  );
};

export default Modal;
