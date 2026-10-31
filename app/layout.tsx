import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ចិត្រា AI — ពិពណ៌នារូបភាព",
  description:
    "ពិពណ៌នារូបភាពជា English ដោយផ្អែកលើភស្តុតាង ហើយបកប្រែខ្មែរតាម Google Translate នៅពេលត្រូវការ។",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="km">
      <body>{children}</body>
    </html>
  );
}
