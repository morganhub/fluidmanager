"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resetPassword } from "@/lib/api";
import { Loader2, Lock, ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";

function ResetPasswordForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get("token");

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    // Check if token is present
    const hasToken = !!token;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");

        // Validate passwords match
        if (password !== confirmPassword) {
            setError("Les mots de passe ne correspondent pas");
            return;
        }

        // Validate password length
        if (password.length < 6) {
            setError("Le mot de passe doit contenir au moins 6 caractères");
            return;
        }

        if (!token) {
            setError("Token de réinitialisation manquant");
            return;
        }

        setLoading(true);

        try {
            await resetPassword(token, password);
            setSuccess(true);

            // Redirect to login after 3 seconds
            setTimeout(() => {
                router.push("/login");
            }, 3000);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Une erreur est survenue";

            if (message.includes("expired")) {
                setError("Ce lien a expiré. Veuillez refaire une demande de réinitialisation.");
            } else if (message.includes("already used")) {
                setError("Ce lien a déjà été utilisé. Veuillez refaire une demande de réinitialisation.");
            } else if (message.includes("Invalid")) {
                setError("Lien invalide. Veuillez refaire une demande de réinitialisation.");
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
                        <CardTitle className="text-2xl text-white">
                            {success ? "Mot de passe réinitialisé" : "Nouveau mot de passe"}
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            {success
                                ? "Vous pouvez maintenant vous connecter"
                                : "Choisissez un nouveau mot de passe"
                            }
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent>
                    {!hasToken ? (
                        // No token provided
                        <div className="space-y-6">
                            <div className="flex flex-col items-center space-y-4 py-4">
                                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
                                    <AlertCircle className="h-8 w-8 text-red-500" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-slate-300">
                                        Lien de réinitialisation invalide ou manquant.
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        Veuillez refaire une demande de réinitialisation.
                                    </p>
                                </div>
                            </div>

                            <Link href="/forgot-password">
                                <Button
                                    className="w-full bg-gradient-to-r from-fm-blue to-fm-purple hover:opacity-90"
                                >
                                    Demander un nouveau lien
                                </Button>
                            </Link>
                        </div>
                    ) : success ? (
                        // Success state
                        <div className="space-y-6">
                            <div className="flex flex-col items-center space-y-4 py-4">
                                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                    <CheckCircle className="h-8 w-8 text-green-500" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-slate-300">
                                        Votre mot de passe a été réinitialisé avec succès.
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        Redirection vers la page de connexion...
                                    </p>
                                </div>
                            </div>

                            <Link href="/login">
                                <Button
                                    variant="outline"
                                    className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                                >
                                    Aller à la connexion
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        // Password form
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* New password field */}
                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-slate-300">
                                    Nouveau mot de passe
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
                                        minLength={6}
                                        autoComplete="new-password"
                                    />
                                </div>
                                <p className="text-xs text-slate-500">
                                    Minimum 6 caractères
                                </p>
                            </div>

                            {/* Confirm password field */}
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword" className="text-slate-300">
                                    Confirmer le mot de passe
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        placeholder="••••••••"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="pl-10 bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 focus:border-fm-blue"
                                        required
                                        autoComplete="new-password"
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
                                disabled={loading || !password || !confirmPassword}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Réinitialisation...
                                    </>
                                ) : (
                                    "Réinitialiser le mot de passe"
                                )}
                            </Button>

                            {/* Back to login link */}
                            <div className="text-center">
                                <Link
                                    href="/login"
                                    className="inline-flex items-center text-sm text-slate-400 hover:text-fm-blue transition-colors"
                                >
                                    <ArrowLeft className="mr-1 h-3 w-3" />
                                    Retour à la connexion
                                </Link>
                            </div>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                <Loader2 className="h-8 w-8 animate-spin text-fm-blue" />
            </div>
        }>
            <ResetPasswordForm />
        </Suspense>
    );
}
