import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "BMP Booking",
  description: "ระบบจัดการการจองคลินิกบ้านหมอปอยรักษาสัตว์",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
