"use client";

import { useState, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search, User, Users, ChevronRight } from "lucide-react";
import { createTranslator } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { apiGet, apiPost } from "@/lib/api";
import Image from "next/image";
import { RecruitConfirmDialog } from "./RecruitConfirmDialog";

interface Position {
    id: string;
    level: string;
    position_index: number;
    parent_position_id: string | null;
}

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

interface RecruitmentDrawerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    position: Position | null;
    companyId: string;
    onSuccess: () => void;
}

export function RecruitmentDrawer({
    open,
    onOpenChange,
    position,
    companyId,
    onSuccess,
}: RecruitmentDrawerProps) {
    const t = createTranslator("fr");
    const { locale } = useAppStore();

    const [blueprints, setBlueprints] = useState<AvailableBlueprint[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [selectedBlueprint, setSelectedBlueprint] = useState<AvailableBlueprint | null>(null);
    const [confirmOpen, setConfirmOpen] = useState(false);

    const fetchBlueprints = useCallback(async () => {
        if (!position || !companyId) return;

        try {
            setLoading(true);
            const params: Record<string, string> = { position_id: position.id };
            if (search) {
                params.search = search;
            }

            const data = await apiGet<{ items: AvailableBlueprint[] }>(
                `/companies/${companyId}/org-chart/available-blueprints`,
                params
            );
            setBlueprints(data.items || []);
        } catch (err) {
            console.error("Failed to fetch blueprints:", err);
        } finally {
            setLoading(false);
        }
    }, [position, companyId, search]);

    useEffect(() => {
        if (open && position) {
            fetchBlueprints();
        }
    }, [open, position, fetchBlueprints]);

    // Debounced search
    useEffect(() => {
        if (!open) return;
        const timer = setTimeout(() => {
            fetchBlueprints();
        }, 300);
        return () => clearTimeout(timer);
    }, [search, open, fetchBlueprints]);

    const handleSelectBlueprint = (blueprint: AvailableBlueprint) => {
        setSelectedBlueprint(blueprint);
        setConfirmOpen(true);
    };

    const handleConfirmRecruit = async () => {
        if (!selectedBlueprint || !position || !companyId) return;

        try {
            await apiPost(`/companies/${companyId}/org-chart/recruit`, {
                position_id: position.id,
                blueprint_id: selectedBlueprint.id,
            });
            setConfirmOpen(false);
            setSelectedBlueprint(null);
            onSuccess();
        } catch (err) {
            console.error("Recruit error:", err);
        }
    };

    const levelLabels: Record<string, Record<string, string>> = {
        N: { fr: "Co-Président", en: "Co-President" },
        "N-1": { fr: "Directeur", en: "Director" },
        "N-2": { fr: "Collaborateur", en: "Employee" },
    };

    const getLocalizedText = (obj: Record<string, string> | null | undefined): string => {
        if (!obj) return "";
        return obj[locale as string] || obj.fr || Object.values(obj)[0] || "";
    };

    return (
        <>
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                        <SheetTitle className="flex items-center gap-2">
                            <Users className="w-5 h-5" />
                            {locale === "fr" ? "Recruter un profil" : "Recruit a profile"}
                        </SheetTitle>
                        {position && (
                            <Badge variant="secondary" className="w-fit">
                                {levelLabels[position.level]?.[locale as "fr" | "en"] || position.level}
                            </Badge>
                        )}
                    </SheetHeader>

                    <div className="mt-4 space-y-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder={locale === "fr" ? "Rechercher un rôle..." : "Search for a role..."}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>

                        {/* Blueprint list */}
                        <ScrollArea className="h-[calc(100vh-200px)]">
                            {loading ? (
                                <div className="flex items-center justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </div>
                            ) : blueprints.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    {locale === "fr"
                                        ? "Aucun profil disponible pour ce poste"
                                        : "No profiles available for this position"}
                                </div>
                            ) : (
                                <div className="space-y-3 pr-4">
                                    {blueprints.map((bp) => (
                                        <Card
                                            key={bp.id}
                                            className="cursor-pointer hover:border-primary transition-colors"
                                            onClick={() => handleSelectBlueprint(bp)}
                                        >
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-4">
                                                    {/* Portrait */}
                                                    <div className="w-14 h-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                                                        {bp.portrait_uri ? (
                                                            <Image
                                                                src={bp.portrait_uri}
                                                                alt={getLocalizedText(bp.role)}
                                                                width={56}
                                                                height={56}
                                                                className="object-cover w-full h-full"
                                                            />
                                                        ) : (
                                                            <User className="w-6 h-6 text-muted-foreground" />
                                                        )}
                                                    </div>

                                                    {/* Info */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="font-semibold truncate">
                                                                {getLocalizedText(bp.role)}
                                                            </h4>
                                                            {bp.already_hired_count > 0 && (
                                                                <Badge variant="outline" className="text-xs shrink-0">
                                                                    {bp.already_hired_count} {locale === "fr" ? "en poste" : "hired"}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-sm text-muted-foreground truncate">
                                                            {bp.default_first_name} {bp.default_last_name}
                                                        </p>
                                                        {bp.skills.length > 0 && (
                                                            <div className="flex flex-wrap gap-1 mt-2">
                                                                {bp.skills.slice(0, 3).map((skill) => (
                                                                    <Badge key={skill} variant="secondary" className="text-xs">
                                                                        {skill}
                                                                    </Badge>
                                                                ))}
                                                                {bp.skills.length > 3 && (
                                                                    <Badge variant="secondary" className="text-xs">
                                                                        +{bp.skills.length - 3}
                                                                    </Badge>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </SheetContent>
            </Sheet>

            {/* Confirm Dialog */}
            <RecruitConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                blueprint={selectedBlueprint}
                onConfirm={handleConfirmRecruit}
            />
        </>
    );
}
