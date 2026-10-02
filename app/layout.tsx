import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
import { ThemeSync } from "@/components/workspace/theme-toggle";
import { DemoProvider } from "@/components/workspace/demo-store";
import { databaseEnabled } from "@/lib/db";

export const metadata: Metadata = {
  title: "MARCON | Portal e gestão de materiais",
  description: "Acesso ao portal Marcon e à gestão de materiais Smartway.",
};

import { currentUser } from "@/lib/auth";
import JamesAssistant from "@/components/james/JamesAssistant";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();
  const showJames = !!user;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script id="marcon-theme" dangerouslySetInnerHTML={{ __html: `try{document.documentElement.dataset.theme=localStorage.getItem("marcon-workspace-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}` }} />
      </head>
      <body>
        <ThemeSync />
        <DemoProvider
          persistent={databaseEnabled()}
          key={user?.id ?? "anonymous"}
          accountId={user?.id}
        >
          {children}
          {showJames && (
            <JamesAssistant
              userId={user.id}
              key={`${user.id}:${user.role}:${user.block ?? ""}`}
            />
          )}
        </DemoProvider>
      </body>
    </html>
  );
}
