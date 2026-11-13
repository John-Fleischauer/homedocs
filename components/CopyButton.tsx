"use client";

import { useState } from "react";
import { buttonClass } from "./ui/Button";

export function CopyButton({
  text,
  label = "Copy",
}: {
  text: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary", "min-h-9 self-start px-3 text-sm")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          prompt("Copy this:", text);
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
