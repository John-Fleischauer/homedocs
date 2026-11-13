/* Inline icons: one stroke style, sized by the caller. */

const PATHS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z",
  place:
    "M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  fixture:
    "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4.9 1 .9 1.6V16h5.2v-.5c0-.6.3-1.2.9-1.6A6 6 0 0 0 12 3z",
  part: "M4 7l8-4 8 4-8 4-8-4zm0 0v10l8 4m0-10v10m8-14v10l-8 4",
  note: "M5 4h10l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm3 8h8m-8 4h5",
  contact: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0",
  project:
    "M9 5h10M9 12h10M9 19h10M4.5 5l1 1 2-2M4.5 12l1 1 2-2M4.5 19l1 1 2-2",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 3-4.5-4.5",
  chevron: "M9 6l6 6-6 6",
  back: "M15 6l-6 6 6 6",
  phone:
    "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M4 6h16v12H4zm0 0 8 7 8-7",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  link: "M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1m-2 5a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1",
  key: "M15 7a4 4 0 1 1-3.9 5H8v3H5v-3H3v-3h8.1A4 4 0 0 1 15 7z",
  guide: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zm0 0v16m4-14h7",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3",
  check: "M5 12l5 5 9-10",
  close: "M6 6l12 12M18 6 6 18",
  edit: "M4 20h4L19 9l-4-4L4 16zm9-13 4 4",
  alert: "M12 4 2 20h20zm0 6v4m0 3h.01",
  external: "M14 4h6v6m0-6-9 9M18 14v6H4V6h6",
  printer: "M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z",
  // Systems (lib/systems/seeds.ts SYSTEM_ICONS).
  system: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  water: "M12 3s-6 6.8-6 11a6 6 0 0 0 12 0c0-4.2-6-11-6-11z",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6z",
  climate: "M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0zM12 17v-6",
  flame:
    "M12 21a6 6 0 0 0 6-6c0-3.5-2.5-5.5-4-9.5-1.5 2-2.5 3.5-2.5 5.5-1-.8-1.8-1.8-2-3-2 2-3.5 4.3-3.5 7a6 6 0 0 0 6 6z",
  drain: "M4 7h16M6 7v4a6 6 0 0 0 12 0V7M10 17v4m4-4v4",
  leaf: "M5 19C5 10.5 11 5 20 4c0 9-5.5 15-14 15zm0 0 8-8",
  shield: "M12 3l8 3v6c0 4.5-3.4 7.8-8 9-4.6-1.2-8-4.5-8-9V6z",
  wifi: "M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M9 16a4.5 4.5 0 0 1 6 0M12 19.5h.01",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
