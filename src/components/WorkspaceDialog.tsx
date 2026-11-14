"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
export default function WorkspaceDialog({
  children,
  close,
  label,
  wide = false,
}: {
  children: ReactNode;
  close: () => void;
  label: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.close();
      }}
      aria-label={label}
      className={`workspace-dialog ${wide ? "wide" : ""}`}
    >
      <button
        className="dialog-close icon-button"
        onClick={() => ref.current?.close()}
        aria-label="Close dialog"
      >
        <X size={18} />
      </button>
      {children}
    </dialog>
  );
}
