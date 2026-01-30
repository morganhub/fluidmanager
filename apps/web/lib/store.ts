import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser } from "./api";

/**
 * App Store - Global state management
 */

interface AppState {
    // Current context
    currentCompanyCode: string | null;
    currentProjectCode: string | null;

    // UI state
    sidebarCollapsed: boolean;
    drawerOpen: boolean;
    drawerContent: DrawerContent | null;

    // Theme
    theme: "light" | "dark" | "system";
    locale: "fr" | "en";

    // Actions
    setCurrentCompany: (code: string | null) => void;
    setCurrentProject: (code: string | null) => void;
    toggleSidebar: () => void;
    openDrawer: (content: DrawerContent) => void;
    closeDrawer: () => void;
    setTheme: (theme: "light" | "dark" | "system") => void;
    setLocale: (locale: "fr" | "en") => void;
}

export type DrawerContent =
    | { type: "task"; taskId: string }
    | { type: "employee"; employeeId: string }
    | { type: "integration"; integrationId: string }
    | { type: "meeting"; meetingId: string }
    | { type: "create-task"; projectId?: string }
    | { type: "create-employee" }
    | { type: "create-integration" }
    | { type: "create-meeting"; projectId?: string }
    | { type: "create-user" }
    | { type: "edit-user"; userId: string }
    | { type: "create-company" }
    | { type: "edit-company"; companyId: string };

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            // Initial state
            currentCompanyCode: null,
            currentProjectCode: null,
            sidebarCollapsed: false,
            drawerOpen: false,
            drawerContent: null,
            theme: "system",
            locale: "fr",

            // Actions
            setCurrentCompany: (code) =>
                set({ currentCompanyCode: code, currentProjectCode: null }),

            setCurrentProject: (code) => set({ currentProjectCode: code }),

            toggleSidebar: () =>
                set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

            openDrawer: (content) => set({ drawerOpen: true, drawerContent: content }),

            closeDrawer: () => set({ drawerOpen: false, drawerContent: null }),

            setTheme: (theme) => set({ theme }),

            setLocale: (locale) => set({ locale }),
        }),
        {
            name: "fm-app-store",
            partialize: (state) => ({
                currentCompanyCode: state.currentCompanyCode,
                currentProjectCode: state.currentProjectCode,
                sidebarCollapsed: state.sidebarCollapsed,
                theme: state.theme,
                locale: state.locale,
            }),
        }
    )
);

/**
 * Auth Store - User authentication state
 */
interface AuthState {
    isAuthenticated: boolean;
    user: AuthUser | null;
    allowedCompanies: string[];  // Company IDs user can access

    // Actions
    setAuthenticated: (value: boolean) => void;
    setUser: (user: AuthUser | null) => void;
    setAllowedCompanies: (companies: string[]) => void;
    login: (user: AuthUser) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            user: null,
            allowedCompanies: [],

            setAuthenticated: (value) => set({ isAuthenticated: value }),

            setUser: (user) => set({ user }),

            setAllowedCompanies: (companies) => set({ allowedCompanies: companies }),

            login: (user) => set({
                isAuthenticated: true,
                user,
                allowedCompanies: user.companies,
            }),

            logout: () => set({
                isAuthenticated: false,
                user: null,
                allowedCompanies: [],
            }),
        }),
        {
            name: "fm-auth-store",
            partialize: (state) => ({
                isAuthenticated: state.isAuthenticated,
                user: state.user,
                allowedCompanies: state.allowedCompanies,
            }),
        }
    )
);

/**
 * Hook to check if current user is superadmin
 */
export function useIsSuperadmin(): boolean {
    const user = useAuthStore((state) => state.user);
    return user?.role === "superadmin";
}

/**
 * Hook to get current user
 */
export function useUser(): AuthUser | null {
    return useAuthStore((state) => state.user);
}
