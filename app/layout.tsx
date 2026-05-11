import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Receipt-to-Form Auto-Fill",
  description: "AI Intern Assessment web app for extracting receipt fields and auto-filling an editable form."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
