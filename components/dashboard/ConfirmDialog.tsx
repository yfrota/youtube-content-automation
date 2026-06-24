"use client";

import { useState } from "react";
import { Modal } from "./Modal";
import { useT } from "@/lib/i18n/context";

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmar",
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const t = useT();
  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (submitting) return;
    setSubmitting(true);
    await onConfirm();
    setSubmitting(false);
  }

  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
      <div className="mt-6 flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-medium text-gray-500 transition-colors duration-200 hover:bg-gray-50 hover:text-foreground dark:text-gray-400 dark:hover:bg-gray-800/50"
        >
          {t("dashboard.cancelDelete")}
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="inline-flex h-9 items-center rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition-colors duration-200 hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
