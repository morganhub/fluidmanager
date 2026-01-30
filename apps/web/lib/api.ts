/**
 * FluidManager API Client
 * Centralized fetch wrapper for all API calls with JWT authentication
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:18000";

interface FetchOptions extends RequestInit {
    params?: Record<string, string>;
    skipAuth?: boolean;
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

// =============================================================================
// Token Management (localStorage)
// =============================================================================

const TOKEN_KEY = "fm_auth_token";
const USER_KEY = "fm_auth_user";

/**
 * Get the JWT token from localStorage
 */
export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Set the JWT token in localStorage
 */
export function setToken(token: string): void {
    if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_KEY, token);
    }
}

/**
 * Clear auth data from localStorage
 */
export function clearAuth(): void {
    if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }
}

/**
 * Get stored user info
 */
export function getStoredUser(): AuthUser | null {
    if (typeof window === "undefined") return null;
    const data = localStorage.getItem(USER_KEY);
    if (!data) return null;
    try {
        return JSON.parse(data);
    } catch {
        return null;
    }
}

/**
 * Store user info
 */
export function setStoredUser(user: AuthUser): void {
    if (typeof window !== "undefined") {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
    return !!getToken();
}

// =============================================================================
// Deprecated: API Key functions (for backward compatibility)
// =============================================================================

/** @deprecated Use getToken() instead */
export function getApiKey(): string | null {
    return getToken();
}

/** @deprecated Use setToken() instead */
export function setApiKey(key: string): void {
    setToken(key);
}

/** @deprecated Use clearAuth() instead */
export function clearApiKey(): void {
    clearAuth();
}

// =============================================================================
// API Fetch Wrapper
// =============================================================================

/**
 * Main fetch wrapper with JWT authentication
 */
export async function api<T = unknown>(
    endpoint: string,
    options: FetchOptions = {}
): Promise<T> {
    const { params, headers: customHeaders, skipAuth, ...fetchOptions } = options;

    // Build URL with query params
    let url = `${API_URL}${endpoint}`;
    if (params) {
        const searchParams = new URLSearchParams(params);
        url += `?${searchParams.toString()}`;
    }

    // Build headers
    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...customHeaders,
    };

    // Add Authorization header if authenticated (unless skipAuth)
    if (!skipAuth) {
        const token = getToken();
        if (token) {
            (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
        } else if (!endpoint.startsWith("/auth/")) {
            throw new ApiError("Not authenticated", 401);
        }
    }

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

        // Clear auth on 401
        if (response.status === 401) {
            clearAuth();
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

export const apiPost = <T>(endpoint: string, body?: unknown, options?: FetchOptions) =>
    api<T>(endpoint, { method: "POST", body: JSON.stringify(body), ...options });

export const apiPut = <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: "PUT", body: JSON.stringify(body) });

export const apiPatch = <T>(endpoint: string, body?: unknown) =>
    api<T>(endpoint, { method: "PATCH", body: JSON.stringify(body) });

export const apiDelete = <T>(endpoint: string) =>
    api<T>(endpoint, { method: "DELETE" });

// =============================================================================
// Auth API Functions
// =============================================================================

export interface AuthUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: "superadmin" | "manager";
    organization: string | null;
    companies: string[];
}

export interface LoginResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    user: AuthUser;
}

export interface LoginRequest {
    email: string;
    password: string;
}

/**
 * Login with email and password
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
    const response = await apiPost<LoginResponse>("/auth/login", { email, password }, { skipAuth: true });

    // Store token and user
    setToken(response.access_token);
    setStoredUser(response.user);

    return response;
}

/**
 * Get current user info from API
 */
export async function getCurrentUser(): Promise<AuthUser> {
    return apiGet<AuthUser>("/auth/me");
}

/**
 * Refresh the JWT token
 */
export async function refreshToken(): Promise<LoginResponse> {
    const response = await apiPost<LoginResponse>("/auth/refresh");
    setToken(response.access_token);
    setStoredUser(response.user);
    return response;
}

/**
 * Request password reset
 */
export async function forgotPassword(email: string): Promise<{ message: string }> {
    return apiPost<{ message: string }>("/auth/forgot-password", { email }, { skipAuth: true });
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    return apiPost<{ message: string }>("/auth/reset-password", { token, new_password: newPassword }, { skipAuth: true });
}

/**
 * Logout - clear local auth data
 */
export function logout(): void {
    clearAuth();
}

// =============================================================================
// Type exports for common API responses
// =============================================================================

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

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    page_size: number;
}

// =============================================================================
// Blueprint & Portrait Types
// =============================================================================

export interface Portrait {
    id: string;
    filename: string;
    uri: string;
    uploaded_by: string | null;
    created_at: string;
}

export interface BlueprintRelation {
    id: string;
    code: string;
    role: LocalizedText;
}

export interface Webhooks {
    review: string | null;
    meeting: string | null;
    task: string | null;
}

// Localized text for multilingual fields
// Format: { "fr": "French text", "en": "English text" }
export type LocalizedText = Record<string, string>;

// Supported locales for the application
export const SUPPORTED_LOCALES = ["fr", "en"] as const;
export type SupportedLocale = typeof SUPPORTED_LOCALES[number];

// Helper to get a translation with fallback
export function getLocalizedText(
    text: LocalizedText | string | null | undefined,
    locale: SupportedLocale = "fr",
    fallback: SupportedLocale = "fr"
): string {
    if (!text) return "";
    if (typeof text === "string") return text; // Backward compatibility
    return text[locale] || text[fallback] || Object.values(text)[0] || "";
}

export interface Blueprint {
    id: string;
    code: string;
    role: LocalizedText;
    level: "N" | "N-1" | "N-2";
    default_first_name: string;
    default_last_name: string;
    default_bio: LocalizedText;
    default_portrait_id: string | null;
    default_portrait_uri: string | null;
    skills: string[];
    system_prompt: LocalizedText;
    webhooks: Webhooks;
    is_active: boolean;
    parent_blueprints: BlueprintRelation[];
    child_blueprints: BlueprintRelation[];
    created_at: string;
    updated_at: string;
}

export interface BlueprintCreate {
    code: string;
    role: LocalizedText;
    level: "N" | "N-1" | "N-2";
    default_first_name?: string;
    default_last_name?: string;
    default_bio?: LocalizedText;
    default_portrait_id?: string | null;
    skills?: string[];
    system_prompt?: LocalizedText;
    webhooks?: Partial<Webhooks>;
    is_active?: boolean;
    parent_blueprint_ids?: string[];
    child_blueprint_ids?: string[];
}

export interface BlueprintUpdate extends Partial<BlueprintCreate> { }


// =============================================================================
// Blueprint API Functions
// =============================================================================

export async function getBlueprints(params?: {
    page?: number;
    page_size?: number;
    search?: string;
    level?: string;
    is_active?: boolean;
}): Promise<PaginatedResponse<Blueprint>> {
    const queryParams: Record<string, string> = {};
    if (params?.page) queryParams.page = String(params.page);
    if (params?.page_size) queryParams.page_size = String(params.page_size);
    if (params?.search) queryParams.search = params.search;
    if (params?.level) queryParams.level = params.level;
    if (params?.is_active !== undefined) queryParams.is_active = String(params.is_active);

    return apiGet<PaginatedResponse<Blueprint>>("/admin/blueprints", queryParams);
}

export async function getBlueprint(id: string): Promise<Blueprint> {
    return apiGet<Blueprint>(`/admin/blueprints/${id}`);
}

export async function createBlueprint(data: BlueprintCreate): Promise<Blueprint> {
    return apiPost<Blueprint>("/admin/blueprints", data);
}

export async function updateBlueprint(id: string, data: BlueprintUpdate): Promise<Blueprint> {
    return apiPut<Blueprint>(`/admin/blueprints/${id}`, data);
}

export async function deleteBlueprint(id: string): Promise<void> {
    return apiDelete(`/admin/blueprints/${id}`);
}

// =============================================================================
// Portrait API Functions
// =============================================================================

export async function getPortraits(search?: string): Promise<{ items: Portrait[]; total: number }> {
    const params = search ? { search } : undefined;
    return apiGet<{ items: Portrait[]; total: number }>("/admin/portraits", params);
}

export async function uploadPortrait(file: File): Promise<Portrait> {
    const formData = new FormData();
    formData.append("file", file);

    const token = getToken();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:18000"}/admin/portraits`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
        },
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Upload failed" }));
        throw new Error(error.detail || "Upload failed");
    }

    return response.json();
}

export async function deletePortrait(id: string): Promise<void> {
    return apiDelete(`/admin/portraits/${id}`);
}
