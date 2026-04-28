import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X as XIcon } from "lucide-react";
import "./Notification.css";

const NotificationContext = createContext();

export function useNotification() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);

  // --- Toast notifications ---
  const addToast = useCallback((message, type = "info", duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, duration }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const success = useCallback((msg) => addToast(msg, "success", 3200), [addToast]);
  const error = useCallback((msg) => addToast(msg, "error", 5000), [addToast]);
  const warning = useCallback((msg) => addToast(msg, "warning", 4500), [addToast]);
  const info = useCallback((msg) => addToast(msg, "info", 3500), [addToast]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // --- Confirm modal ---
  const confirm = useCallback((message, title = "Confirm") => {
    return new Promise((resolve) => {
      setConfirmModal({ title, message, resolve });
    });
  }, []);

  const handleConfirm = (result) => {
    if (confirmModal?.resolve) confirmModal.resolve(result);
    setConfirmModal(null);
  };

  const notify = { success, error, warning, info, confirm };

  const ICONS = {
    success: <CheckCircle2 size={18} strokeWidth={2} />,
    error: <XCircle size={18} strokeWidth={2} />,
    warning: <AlertTriangle size={18} strokeWidth={2} />,
    info: <Info size={18} strokeWidth={2} />
  };

  return (
    <NotificationContext.Provider value={notify}>
      {children}

      {/* Toast container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`} onClick={() => removeToast(toast.id)}>
            <span className="toast-icon">{ICONS[toast.type]}</span>
            <span className="toast-msg">{toast.message}</span>
            <button
              className="toast-close"
              onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
              aria-label="Dismiss"
            ><XIcon size={14} strokeWidth={2.5} /></button>
            <span
              className="toast-progress"
              style={{ animationDuration: `${toast.duration}ms` }}
            />
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmModal && (
        <div className="confirm-overlay" onClick={() => handleConfirm(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3 className="confirm-title">{confirmModal.title}</h3>
            <p className="confirm-message">{confirmModal.message}</p>
            <div className="confirm-actions">
              <button className="confirm-btn cancel" onClick={() => handleConfirm(false)}>Cancel</button>
              <button className="confirm-btn ok" onClick={() => handleConfirm(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </NotificationContext.Provider>
  );
}
