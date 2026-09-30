import type { Metadata } from "next";
import "./globals.css";
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
    <html lang="pt-BR">
      <body>
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
