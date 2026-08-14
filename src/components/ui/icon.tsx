import type { SVGProps } from "react";

export type IconName =
  | "dashboard"
  | "cat"
  | "dog"
  | "calendar"
  | "finance"
  | "users"
  | "settings"
  | "menu"
  | "close"
  | "logout"
  | "chevron-left"
  | "chevron-right"
  | "home"
  | "info"
  | "sparkle"
  | "pos"
  | "employee"
  | "stethoscope";

const paths: Record<IconName, React.ReactNode> = {
  dashboard: (
    <path d="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z" />
  ),
  cat: (
    <path d="M6 8 4 3l5 3a8 8 0 0 1 6 0l5-3-2 5a7 7 0 1 1-12 0Zm3 4h.01M15 12h.01M10 16c1.2 1 2.8 1 4 0" />
  ),
  dog: (
    <path d="M7 7 4 5v5c0 1.1.9 2 2 2h1m10-5 3-2v5a2 2 0 0 1-2 2h-1M8 8a6 6 0 0 1 8 0v7a4 4 0 0 1-8 0V8Zm3 4h.01M15 12h.01M11 16h4" />
  ),
  calendar: (
    <path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 8h3v3H8v-3Z" />
  ),
  finance: (
    <path d="M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  ),
  users: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87m-2-11.96a4 4 0 0 1 0 7.75" />
  ),
  settings: (
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-3.5a7.7 7.7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.8-1L14.8 3h-4l-.4 3a8 8 0 0 0-1.8 1l-2.4-1-2 3.5 2 1.5a7.7 7.7 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.8 1l.4 3h4l.4-3a8 8 0 0 0 1.8-1l2.4 1 2-3.5-2-1.5c.1-.3.1-.7.1-1Z" />
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  logout: <path d="M10 17l5-5-5-5m5 5H3m11-9h6v18h-6" />,
  "chevron-left": <path d="m15 18-6-6 6-6" />,
  "chevron-right": <path d="m9 18 6-6-6-6" />,
  home: <path d="m3 11 9-8 9 8v10h-6v-6H9v6H3V11Z" />,
  info: <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-10h.01" />,
  sparkle: (
    <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
  ),
  pos: <path d="M4 4h16v13H4V4Zm3 13v3m10-3v3M7 8h4m-4 4h2m5-4h3v4h-3V8Z" />,
  employee: (
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-5h6m-3-3v6" />
  ),
  stethoscope: (
    <path d="M5 3v5a5 5 0 0 0 10 0V3m-7 0v3m4-3v3m3 8v2a4 4 0 0 0 8 0v-1m-2-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
  ),
};

export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
