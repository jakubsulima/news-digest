"use client";

import { NotebookPen } from "lucide-react";
import { useState } from "react";

import { NoteComposer } from "@/components/note-composer";
import { useLocalize } from "@/components/reader-locale-provider";
import { Button } from "@/components/ui/button";
import type { ReaderNoteKind } from "@/lib/reader-note-types";
import { cn } from "@/lib/utils";

type NewsNoteActionProps = {
  buttonClassName?: string;
  buttonSize?: "sm" | "icon-sm" | "icon-lg";
  initialCount?: number;
  count?: number;
  initialKind?: ReaderNoteKind;
  itemId: string;
  onCreated?: () => void;
  showLabel?: boolean;
};

export function NewsNoteAction({
  buttonClassName,
  buttonSize = "icon-lg",
  initialCount = 0,
  count: controlledCount,
  initialKind = "thought",
  itemId,
  onCreated,
  showLabel = false,
}: NewsNoteActionProps) {
  const l = useLocalize();
  const [open, setOpen] = useState(false);
  const [localCount, setCount] = useState(initialCount);
  const count = controlledCount ?? localCount;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size={buttonSize}
        className={cn("relative", buttonClassName)}
        title={l("Dodaj notatkę", "Add note")}
        aria-label={l("Dodaj notatkę", "Add note")}
        onClick={() => setOpen(true)}
      >
        <NotebookPen fill={count ? "currentColor" : "none"} aria-hidden="true" />
        {showLabel ? l("Notatka", "Note") : null}
        {!showLabel && count ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">
            {count > 9 ? "9+" : count}
          </span>
        ) : null}
      </Button>
      <NoteComposer
        initialKind={initialKind}
        newsItemId={itemId}
        open={open}
        onCreated={() => {
          setCount((value) => value + 1);
          onCreated?.();
        }}
        onOpenChange={setOpen}
      />
      <span className="sr-only" aria-live="polite">{count ? l(`Liczba notatek: ${count}`, `Number of notes: ${count}`) : ""}</span>
    </>
  );
}
