"use client";

import { useState } from "react";
import { Icon } from "./ui/icons";

/*
 * A linked record's picture, through our proxy. Plenty of records have none (a
 * Homebox location usually doesn't), and the proxy says so with a 404; then
 * this shows the plain link icon instead of a broken image.
 */
export function LinkThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sunk text-ink-2">
        <Icon name="external" className="h-[18px] w-[18px]" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- proxied through our own guarded route
    <img
      src={src}
      alt=""
      onError={() => setFailed(true)}
      className="h-10 w-10 shrink-0 rounded-md bg-sunk object-cover"
      loading="lazy"
    />
  );
}
