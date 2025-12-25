import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "D&D PDF Studio",
  description: "Generate book-style, print-ready PDFs for D&D content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
