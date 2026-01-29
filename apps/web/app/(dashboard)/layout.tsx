"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Sidebar } from "@/components/layout/Sidebar";
import { ContextDrawer } from "@/components/layout/ContextDrawer";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const { sidebarCollapsed, drawerOpen } = useAppStore();

    // Check authentication on mount
    useEffect(() => {
        if (!isAuthenticated()) {
            router.push("/login");
        }
    }, [router]);

    return (
        <TooltipProvider>
            <div className="flex h-screen overflow-hidden bg-background">
                {/* Sidebar */}
                <Sidebar />

                {/* Main content area */}
                <main
                    className={`flex-1 overflow-auto transition-all duration-300 ${sidebarCollapsed ? "ml-16" : "ml-64"
                        } ${drawerOpen ? "mr-[480px]" : ""}`}
                >
                    <div className="container mx-auto p-6">{children}</div>
                </main>

                {/* Context Drawer */}
                <ContextDrawer />
            </div>
        </TooltipProvider>
    );
}
