import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ចិត្រា AI — ពិពណ៌នារូបភាព",
  description:
    "ពិពណ៌នារូបភាពលម្អិតជាភាសាខ្មែរ និងអង់គ្លេស ដោយផ្អែកលើអ្វីដែលមើលឃើញពិតប្រាកដ។",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="km">
      <body>{children}</body>
    </html>
  );
}
