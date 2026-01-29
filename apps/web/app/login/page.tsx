"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { setApiKey, apiGet, type Company, type ListResponse } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { createTranslator } from "@/lib/i18n";

export default function LoginPage() {
    const t = createTranslator("fr");
    const router = useRouter();
    const setAuthenticated = useAuthStore((state) => state.setAuthenticated);

    const [apiKeyInput, setApiKeyInput] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            // Store the API key temporarily
            setApiKey(apiKeyInput);

            // Verify by fetching companies
            await apiGet<ListResponse<Company>>("/companies");

            // Success - mark as authenticated and redirect
            setAuthenticated(true);
            router.push("/dashboard");
        } catch (err) {
            setError(t("auth.invalidKey"));
            setApiKey(""); // Clear invalid key
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-fm-blue/20 rounded-full blur-3xl" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-fm-purple/20 rounded-full blur-3xl" />
            </div>

            <Card className="w-[400px] relative z-10 border-slate-700 bg-slate-900/80 backdrop-blur-xl">
                <CardHeader className="text-center space-y-4">
                    {/* Logo */}
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-fm-blue to-fm-purple flex items-center justify-center">
                        <span className="text-2xl font-bold text-white">FM</span>
                    </div>
                    <div>
                        <CardTitle className="text-2xl text-white">{t("app.name")}</CardTitle>
                        <CardDescription className="text-slate-400">
                            {t("app.tagline")}
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="apiKey" className="text-slate-300">
                                {t("auth.apiKey")}
                            </Label>
                            <Input
                                id="apiKey"
                                type="password"
                                placeholder={t("auth.apiKeyPlaceholder")}
                                value={apiKeyInput}
                                onChange={(e) => setApiKeyInput(e.target.value)}
                                className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-fm-blue"
                                required
                            />
                        </div>

                        {error && (
                            <div className="text-sm text-red-400 bg-red-950/50 px-3 py-2 rounded-md">
                                {error}
                            </div>
                        )}

                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-fm-blue to-fm-purple hover:opacity-90"
                            disabled={loading || !apiKeyInput}
                        >
                            {loading ? t("common.loading") : t("auth.submit")}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
