/**
 * FluidManager API Client
 * Centralized fetch wrapper for all API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:18000";

interface FetchOptions extends RequestInit {
    params?: Record<string, string>;
}

class ApiError extends Error {
    status: number;
    data: unknown;

    constructor(message: string, status: number, data?: unknown) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

/**
 * Get the API key from session storage
 */
export function getApiKey(): string | null {
    if (typeof window === "undefined") return null;
    return sessionStorage.getItem("fm_api_key");
}

/**
 * Set the API key in session storage
 */
export function setApiKey(key: string): void {
    if (typeof window !== "undefined") {
        sessionStorage.setItem("fm_api_key", key);
    }
}

/**
 * Clear the API key from session storage
 */
export function clearApiKey(): void {
    if (typeof window !== "undefined") {
        sessionStorage.removeItem("fm_api_key");
    }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
    return !!getApiKey();
}

/**
 * Main fetch wrapper
 */
export async function api<T = unknown>(
    endpoint: string,
    options: FetchOptions = {}
): Promise<T> {
    const { params, headers: customHeaders, ...fetchOptions } = options;

    // Build URL with query params
    let url = `${API_URL}${endpoint}`;
    if (params) {
        const searchParams = new URLSearchParams(params);
        url += `?${searchParams.toString()}`;
    }

    // Get API key
    const apiKey = getApiKey();
    if (!apiKey && !endpoint.includes("/health")) {
        throw new ApiError("Not authenticated", 401);
    }

    // Build headers
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(apiKey && { "X-API-Key": apiKey }),
        ...customHeaders,
    };

    // Make request
    const response = await fetch(url, {
        ...fetchOptions,
        headers,
    });

    // Handle response
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch {
            errorData = await response.text();
        }
        throw new ApiError(
            errorData?.detail || `HTTP ${response.status}`,
            response.status,
            errorData
        );
    }

    // Parse JSON response
    return response.json();
}

// Convenience methods
export const apiGet = <T>(endpoint: string, params?: Record<string, string>) =>
    api<T>(endpoint, { method: "GET", params });

export const apiPost = <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: "POST", body: JSON.stringify(body) });

export const apiPut = <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: "PUT", body: JSON.stringify(body) });

export const apiPatch = <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: "PATCH", body: JSON.stringify(body) });

export const apiDelete = <T>(endpoint: string) =>
    api<T>(endpoint, { method: "DELETE" });

// Type exports for common API responses
export interface Company {
    id: string;
    code: string;
    name: string;
}

export interface Agent {
    id: string;
    company_id: string;
    slug: string;
    first_name: string;
    last_name: string;
    title?: string;
    department?: string;
    level: "N" | "N-1" | "N-2" | "N-3" | "N-4" | "N-5" | "OTHER";
    is_active: boolean;
    avatar_url?: string;
    created_at: string;
}

export interface Task {
    id: string;
    company_id: string;
    project_id?: string;
    title: string;
    description?: string;
    status: "draft" | "queued" | "running" | "paused" | "blocked" | "needs_approval" | "failed" | "canceled" | "done";
    priority: "low" | "normal" | "high" | "urgent";
    assigned_to_agent_id?: string;
    job_type?: string;
    needs_review?: boolean;
    attempt_count: number;
    max_attempts: number;
    created_at: string;
    updated_at: string;
    runtime_json?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
}

export interface Project {
    id: string;
    company_id: string;
    code: string;
    name: string;
    description?: string;
    status: string;
    locale?: string;
    created_at: string;
}

export interface Integration {
    id: string;
    company_id: string;
    provider_id: string;
    name: string;
    is_active: boolean;
    config_json: Record<string, unknown>;
}

export interface Meeting {
    id: string;
    company_id: string;
    project_id?: string;
    title: string;
    agenda?: string;
    summary?: string;
    started_at?: string;
    ended_at?: string;
    created_at: string;
}

export interface TaskEvent {
    id: string;
    task_id: string;
    event_type: string;
    actor_type: string;
    payload: Record<string, unknown>;
    created_at: string;
}

export interface ListResponse<T> {
    items: T[];
}
