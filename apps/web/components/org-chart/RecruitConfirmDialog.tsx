"use client";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { User, Briefcase, Star } from "lucide-react";
import { useAppStore } from "@/lib/store";
import Image from "next/image";

interface AvailableBlueprint {
    id: string;
    code: string;
    role: Record<string, string>;
    level: string;
    default_first_name: string;
    default_last_name: string;
    default_bio: Record<string, string>;
    portrait_id: string | null;
    portrait_uri: string | null;
    skills: string[];
    already_hired_count: number;
}

interface RecruitConfirmDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    blueprint: AvailableBlueprint | null;
    onConfirm: () => void;
}

export function RecruitConfirmDialog({
    open,
    onOpenChange,
    blueprint,
    onConfirm,
}: RecruitConfirmDialogProps) {
    const { locale } = useAppStore();

    if (!blueprint) return null;

    const getLocalizedText = (obj: Record<string, string> | null | undefined): string => {
        if (!obj) return "";
        return obj[locale as string] || obj.fr || Object.values(obj)[0] || "";
    };

    const levelLabels: Record<string, Record<string, string>> = {
        N: { fr: "Co-Président", en: "Co-President" },
        "N-1": { fr: "Directeur", en: "Director" },
        "N-2": { fr: "Collaborateur", en: "Employee" },
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Briefcase className="w-5 h-5" />
                        {locale === "fr" ? "Confirmer le recrutement" : "Confirm Recruitment"}
                    </DialogTitle>
                </DialogHeader>

                {/* ID Card Style Preview */}
                <Card className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 border-2">
                    <CardContent className="p-6">
                        <div className="flex gap-4">
                            {/* Portrait */}
                            <div className="w-24 h-28 rounded-lg overflow-hidden bg-white dark:bg-slate-700 border-2 border-white shadow-md flex items-center justify-center shrink-0">
                                {blueprint.portrait_uri ? (
                                    <Image
                                        src={blueprint.portrait_uri}
                                        alt={getLocalizedText(blueprint.role)}
                                        width={96}
                                        height={112}
                                        className="object-cover w-full h-full"
                                    />
                                ) : (
                                    <User className="w-12 h-12 text-muted-foreground" />
                                )}
                            </div>

                            {/* Info */}
                            <div className="flex-1 space-y-2">
                                <div>
                                    <h3 className="font-bold text-lg">
                                        {blueprint.default_first_name} {blueprint.default_last_name}
                                    </h3>
                                    <p className="text-sm font-medium text-primary">
                                        {getLocalizedText(blueprint.role)}
                                    </p>
                                </div>

                                <Badge variant="secondary">
                                    {levelLabels[blueprint.level]?.[locale as "fr" | "en"] || blueprint.level}
                                </Badge>
                            </div>
                        </div>

                        {/* Bio */}
                        {getLocalizedText(blueprint.default_bio) && (
                            <p className="mt-4 text-sm text-muted-foreground line-clamp-3">
                                {getLocalizedText(blueprint.default_bio)}
                            </p>
                        )}

                        {/* Skills */}
                        {blueprint.skills.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {blueprint.skills.map((skill) => (
                                    <Badge key={skill} variant="outline" className="text-xs">
                                        <Star className="w-3 h-3 mr-1" />
                                        {skill}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <p className="text-sm text-muted-foreground">
                    {locale === "fr"
                        ? "Ce profil sera ajouté à votre organigramme. Vous pourrez personnaliser son nom et sa bio."
                        : "This profile will be added to your org chart. You can customize their name and bio."}
                </p>

                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {locale === "fr" ? "Annuler" : "Cancel"}
                    </Button>
                    <Button onClick={onConfirm}>
                        {locale === "fr" ? "Recruter" : "Recruit"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
