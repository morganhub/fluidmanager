"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { login } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { createTranslator } from "@/lib/i18n";
import { Loader2, Mail, Lock } from "lucide-react";

export default function LoginPage() {
    const t = createTranslator("fr");
    const router = useRouter();
    const authLogin = useAuthStore((state) => state.login);

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await login(email, password);

            // Update auth store
            authLogin(response.user);

            // Redirect to dashboard
            router.push("/dashboard");
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Une erreur est survenue";

            // Handle specific error cases
            if (message.includes("expired")) {
                setError("Votre compte a expiré. Contactez un administrateur.");
            } else if (message.includes("deactivated")) {
                setError("Votre compte est désactivé. Contactez un administrateur.");
            } else if (message.includes("Invalid email or password")) {
                setError("Email ou mot de passe incorrect");
            } else {
                setError(message);
            }
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
                        {/* Email field */}
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-slate-300">
                                Email
                            </Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="votre@email.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-fm-blue"
                                    required
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        {/* Password field */}
                        <div className="space-y-2">
                            <Label htmlFor="password" className="text-slate-300">
                                Mot de passe
                            </Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-fm-blue"
                                    required
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="text-sm text-red-400 bg-red-950/50 px-3 py-2 rounded-md">
                                {error}
                            </div>
                        )}

                        {/* Submit button */}
                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-fm-blue to-fm-purple hover:opacity-90"
                            disabled={loading || !email || !password}
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Connexion...
                                </>
                            ) : (
                                "Se connecter"
                            )}
                        </Button>

                        {/* Forgot password link */}
                        <div className="text-center">
                            <Link
                                href="/forgot-password"
                                className="text-sm text-slate-400 hover:text-fm-blue transition-colors"
                            >
                                Mot de passe oublié ?
                            </Link>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
