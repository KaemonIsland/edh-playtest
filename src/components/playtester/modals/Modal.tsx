"use client";

import { useUiStore } from "@/lib/game/uiStore";
import { ModalShell } from "@/components/ui/ModalShell";

/** Playtester dialog: ModalShell wired to the game UI store's close action. */
export function Modal({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const closeModal = useUiStore((s) => s.closeModal);
  return (
    <ModalShell onClose={closeModal} title={title} size={wide ? "xl" : "md"}>
      {children}
    </ModalShell>
  );
}
