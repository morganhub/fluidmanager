"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
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
    const pathname = usePathname();
    const { sidebarCollapsed, drawerOpen, setCurrentCompany, setCurrentProject, currentCompanyCode, currentProjectCode } = useAppStore();

    // Check authentication on mount
    useEffect(() => {
        if (!isAuthenticated()) {
            router.push("/login");
        }
    }, [router]);

    // Sync store with URL on mount and pathname changes
    useEffect(() => {
        const parts = pathname.split("/");
        // /companies/[code]
        if (parts[1] === "companies" && parts[2]) {
            if (parts[2] !== currentCompanyCode) {
                setCurrentCompany(parts[2]);
            }

            // /companies/[code]/projects/[pcode]
            if (parts[3] === "projects" && parts[4]) {
                if (parts[4] !== currentProjectCode) {
                    setCurrentProject(parts[4]);
                }
            }
        }
    }, [pathname, currentCompanyCode, currentProjectCode, setCurrentCompany, setCurrentProject]);

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
