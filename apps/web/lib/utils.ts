import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Utility to merge Tailwind classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format a date for display
 */
export function formatDate(date: string | Date, locale = "fr-FR"): string {
    return new Intl.DateTimeFormat(locale, {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(new Date(date));
}

/**
 * Format relative time (e.g., "2 minutes ago")
 */
export function formatRelativeTime(date: string | Date, locale = "fr-FR"): string {
    const now = new Date();
    const past = new Date(date);
    const diffMs = now.getTime() - past.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });

    if (diffDays > 0) return rtf.format(-diffDays, "day");
    if (diffHours > 0) return rtf.format(-diffHours, "hour");
    if (diffMins > 0) return rtf.format(-diffMins, "minute");
    return rtf.format(-diffSecs, "second");
}

/**
 * Truncate text with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 3) + "...";
}

/**
 * Get initials from a name
 */
export function getInitials(firstName: string, lastName?: string): string {
    const first = firstName.charAt(0).toUpperCase();
    const last = lastName?.charAt(0).toUpperCase() || "";
    return first + last;
}

/**
 * Status color mapping for tasks
 */
export const taskStatusColors: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600",
    queued: "bg-blue-100 text-blue-600",
    running: "bg-yellow-100 text-yellow-600",
    paused: "bg-orange-100 text-orange-600",
    blocked: "bg-red-100 text-red-600",
    needs_approval: "bg-purple-100 text-purple-600",
    failed: "bg-red-100 text-red-600",
    canceled: "bg-slate-100 text-slate-500",
    done: "bg-green-100 text-green-600",
};

/**
 * Priority color mapping
 */
export const priorityColors: Record<string, string> = {
    low: "text-slate-500",
    normal: "text-blue-500",
    high: "text-orange-500",
    urgent: "text-red-500",
};

/**
 * Agent level labels
 */
export const levelLabels: Record<string, string> = {
    N: "PDG",
    "N-1": "Direction",
    "N-2": "Management",
    "N-3": "Équipe",
    "N-4": "Junior",
    "N-5": "Stagiaire",
    OTHER: "Autre",
};
