"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppStore, useAuthStore, useIsSuperadmin } from "@/lib/store";
import { createTranslator } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
    LayoutDashboard,
    Building2,
    Users,
    Network,
    Plug,
    FolderKanban,
    CheckSquare,
    Files,
    MessageSquare,
    Activity,
    Settings,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Shield,
    UserCog,
} from "lucide-react";
import { logout as apiLogout } from "@/lib/api";
import { useRouter } from "next/navigation";

interface NavItem {
    href: string;
    label: string;
    icon: React.ElementType;
    children?: NavItem[];
    superadminOnly?: boolean;
}

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const t = createTranslator("fr");
    const { sidebarCollapsed, toggleSidebar, currentCompanyCode, currentProjectCode } = useAppStore();
    const authLogout = useAuthStore((state) => state.logout);
    const user = useAuthStore((state) => state.user);
    const isSuperadmin = useIsSuperadmin();

    const companyBase = currentCompanyCode ? `/companies/${currentCompanyCode}` : "";
    const projectBase = currentProjectCode ? `${companyBase}/projects/${currentProjectCode}` : "";

    const navItems: NavItem[] = [
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
        {
            href: "/companies",
            label: t("nav.companies"),
            icon: Building2,
            children: currentCompanyCode
                ? [
                    { href: `${companyBase}/settings`, label: t("nav.settings"), icon: Settings },
                    { href: `${companyBase}/employees`, label: t("nav.employees"), icon: Users },
                    { href: `${companyBase}/hierarchy`, label: t("nav.hierarchy"), icon: Network },
                    { href: `${companyBase}/integrations`, label: t("nav.integrations"), icon: Plug },
                ]
                : [],
        },
        {
            href: `${companyBase}/projects`,
            label: t("nav.projects"),
            icon: FolderKanban,
            children: currentProjectCode
                ? [
                    { href: `${projectBase}/tasks`, label: t("nav.tasks"), icon: CheckSquare },
                    { href: `${projectBase}/files`, label: t("nav.files"), icon: Files },
                    { href: `${projectBase}/meetings`, label: t("nav.meetings"), icon: MessageSquare },
                    { href: `${projectBase}/activity`, label: t("nav.activity"), icon: Activity },
                ]
                : [],
        },
        // System menu - superadmin only
        {
            href: "/system",
            label: t("nav.system"),
            icon: Shield,
            superadminOnly: true,
            children: [
                { href: "/system/users", label: t("nav.users"), icon: UserCog },
                { href: "/system/companies", label: t("nav.companiesAdmin"), icon: Building2 },
            ],
        },
    ];

    // Filter menu items based on role
    const filteredNavItems = navItems.filter(item => !item.superadminOnly || isSuperadmin);

    function handleLogout() {
        apiLogout();
        authLogout();
        router.push("/login");
    }


    return (
        <div
            className={cn(
                "fixed left-0 top-0 z-40 h-screen border-r border-border bg-card transition-all duration-300",
                sidebarCollapsed ? "w-16" : "w-64"
            )}
        >
            {/* Header */}
            <div className="flex h-16 items-center justify-between px-4 border-b border-border">
                {!sidebarCollapsed && (
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fm-blue to-fm-purple flex items-center justify-center">
                            <span className="text-sm font-bold text-white">FM</span>
                        </div>
                        <span className="font-semibold">{t("app.name")}</span>
                    </div>
                )}
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={toggleSidebar}
                    className="ml-auto"
                >
                    {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                </Button>
            </div>

            {/* Navigation */}
            <ScrollArea className="h-[calc(100vh-8rem)]">
                <nav className="p-2 space-y-1">
                    {filteredNavItems.map((item) => (
                        <div key={item.href}>
                            <NavLink
                                item={item}
                                pathname={pathname}
                                collapsed={sidebarCollapsed}
                            />
                            {item.children && item.children.length > 0 && !sidebarCollapsed && (
                                <div className="ml-6 mt-1 space-y-1">
                                    {item.children.map((child) => (
                                        <NavLink
                                            key={child.href}
                                            item={child}
                                            pathname={pathname}
                                            collapsed={sidebarCollapsed}
                                            isChild
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </nav>
            </ScrollArea>

            {/* Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-2 border-t border-border">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button
                            variant="ghost"
                            size={sidebarCollapsed ? "icon" : "default"}
                            className={cn("w-full", !sidebarCollapsed && "justify-start")}
                            onClick={handleLogout}
                        >
                            <LogOut size={18} />
                            {!sidebarCollapsed && <span className="ml-2">{t("auth.logout")}</span>}
                        </Button>
                    </TooltipTrigger>
                    {sidebarCollapsed && (
                        <TooltipContent side="right">{t("auth.logout")}</TooltipContent>
                    )}
                </Tooltip>
            </div>
        </div>
    );
}

function NavLink({
    item,
    pathname,
    collapsed,
    isChild = false,
}: {
    item: NavItem;
    pathname: string;
    collapsed: boolean;
    isChild?: boolean;
}) {
    const Icon = item.icon;
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

    const linkElement = (
        <Link
            href={item.href}
            className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                collapsed && "justify-center px-2",
                isChild && "text-xs py-1.5"
            )}
        >
            <Icon size={isChild ? 14 : 18} />
            {!collapsed && <span>{item.label}</span>}
        </Link>
    );

    if (collapsed) {
        return (
            <Tooltip>
                <TooltipTrigger asChild>{linkElement}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
        );
    }

    return linkElement;
}
