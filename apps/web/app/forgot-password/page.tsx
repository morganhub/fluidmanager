"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { forgotPassword } from "@/lib/api";
import { Loader2, Mail, ArrowLeft, CheckCircle } from "lucide-react";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            await forgotPassword(email);
            setSent(true);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : "Une erreur est survenue";
            setError(message);
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
                            Mot de passe oublié
                        </CardTitle>
                        <CardDescription className="text-slate-400">
                            {sent
                                ? "Vérifiez votre boîte mail"
                                : "Entrez votre email pour recevoir un lien de réinitialisation"
                            }
                        </CardDescription>
                    </div>
                </CardHeader>

                <CardContent>
                    {sent ? (
                        <div className="space-y-6">
                            {/* Success message */}
                            <div className="flex flex-col items-center space-y-4 py-4">
                                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                    <CheckCircle className="h-8 w-8 text-green-500" />
                                </div>
                                <div className="text-center space-y-2">
                                    <p className="text-slate-300">
                                        Si un compte existe avec l&apos;adresse <span className="font-medium text-white">{email}</span>,
                                        vous recevrez un email avec les instructions de réinitialisation.
                                    </p>
                                    <p className="text-sm text-slate-500">
                                        Le lien est valable pendant 1 heure.
                                    </p>
                                </div>
                            </div>

                            {/* Back to login */}
                            <Link href="/login">
                                <Button
                                    variant="outline"
                                    className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
                                >
                                    <ArrowLeft className="mr-2 h-4 w-4" />
                                    Retour à la connexion
                                </Button>
                            </Link>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {/* Email field */}
                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-slate-300">
                                    Adresse email
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
                                disabled={loading || !email}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Envoi en cours...
                                    </>
                                ) : (
                                    "Envoyer le lien"
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
