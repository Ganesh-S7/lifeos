"use client";

import { ReactNode, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { BottomNavigation } from "./bottom-navigation";
import { Header } from "./header";
import { Sidebar } from "./sidebar";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <Dialog.Root open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <div className="min-h-screen bg-background text-text-primary">
        <Sidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <div className="min-h-screen lg:pl-62">
          <Header />

          <main className="px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-6 md:py-6 lg:px-8 lg:py-8">
            <div className="mx-auto w-full min-w-0 max-w-360">
              {children}
            </div>
          </main>
        </div>
        <BottomNavigation />
      </div>
    </Dialog.Root>
  );
}
