import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Cau Claw",
  description: "农业大学一站式平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`min-h-svh font-sans text-base antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
