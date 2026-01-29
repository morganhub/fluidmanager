import { create } from "zustand";
import { persist } from "zustand/middleware";

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
    | { type: "create-meeting"; projectId?: string };

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
 * Auth Store - Separate for security
 */
interface AuthState {
    isAuthenticated: boolean;
    setAuthenticated: (value: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    isAuthenticated: false,
    setAuthenticated: (value) => set({ isAuthenticated: value }),
}));
