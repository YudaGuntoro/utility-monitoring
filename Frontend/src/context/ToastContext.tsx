"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type ToastType = "success" | "error" | "warning" | "info";

type ToastInput = {
  title?: string;
  message: string;
  duration?: number;
};

type Toast = ToastInput & {
  id: number;
  type: ToastType;
};

type ToastContextType = {
  error: (toast: ToastInput) => void;
  info: (toast: ToastInput) => void;
  removeToast: (id: number) => void;
  success: (toast: ToastInput) => void;
  warning: (toast: ToastInput) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const toastStyles: Record<ToastType, string> = {
  error:
    "border-gray-200 border-l-error-500 bg-white text-gray-900 shadow-slate-200/80",
  info: "border-gray-200 border-l-brand-500 bg-white text-gray-900 shadow-slate-200/80",
  success:
    "border-gray-200 border-l-success-600 bg-white text-gray-900 shadow-slate-200/80",
  warning:
    "border-gray-200 border-l-warning-500 bg-white text-gray-900 shadow-slate-200/80",
};

const defaultTitles: Record<ToastType, string> = {
  error: "Error",
  info: "Info",
  success: "Success",
  warning: "Warning",
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const removeToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, toast: ToastInput) => {
      const id = nextId.current;
      nextId.current += 1;

      setToasts((current) => [
        ...current,
        {
          duration: 4000,
          ...toast,
          id,
          type,
        },
      ]);

      if (toast.duration !== 0) {
        globalThis.setTimeout(() => removeToast(id), toast.duration ?? 4000);
      }
    },
    [removeToast]
  );

  const value = useMemo<ToastContextType>(
    () => ({
      error: (toast) => addToast("error", toast),
      info: (toast) => addToast("info", toast),
      removeToast,
      success: (toast) => addToast("success", toast),
      warning: (toast) => addToast("warning", toast),
    }),
    [addToast, removeToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 bottom-4 z-999999 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-lg border border-l-4 p-4 shadow-theme-lg ${toastStyles[toast.type]}`}
            role="status"
          >
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">
                  {toast.title ?? defaultTitles[toast.type]}
                </p>
                <p className="mt-1 text-sm text-gray-600">{toast.message}</p>
              </div>
              <button
                aria-label="Close toast"
                className="rounded-md px-2 text-lg leading-none text-gray-500 opacity-80 hover:text-gray-900 hover:opacity-100"
                onClick={() => removeToast(toast.id)}
                type="button"
              >
                x
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }

  return context;
};
