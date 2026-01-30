"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Trash2, Lock } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { apiPut, apiDelete } from "@/lib/api";
import Image from "next/image";

interface Employee {
    id: string;
    position_id: string;
    blueprint_id: string | null;
    first_name: string;
    last_name: string;
    bio: Record<string, string>;
    portrait_id: string | null;
    portrait_uri: string | null;
    skills: string[];
    email: string | null;
    phone: string | null;
    is_removable: boolean;
    role: Record<string, string> | null;
    level: string | null;
}

interface EmployeeEditDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    employee: Employee | null;
    companyId: string;
    onSuccess: () => void;
}

export function EmployeeEditDialog({
    open,
    onOpenChange,
    employee,
    companyId,
    onSuccess,
}: EmployeeEditDialogProps) {
    const { locale } = useAppStore();

    const [formData, setFormData] = useState({
        first_name: "",
        last_name: "",
        bio: "",
        email: "",
        phone: "",
    });
    const [saving, setSaving] = useState(false);
    const [confirmRemove, setConfirmRemove] = useState(false);

    useEffect(() => {
        if (employee) {
            setFormData({
                first_name: employee.first_name,
                last_name: employee.last_name,
                bio: employee.bio[locale as string] || employee.bio.fr || "",
                email: employee.email || "",
                phone: employee.phone || "",
            });
        }
    }, [employee, locale]);

    const handleSave = async () => {
        if (!employee || !companyId) return;

        try {
            setSaving(true);
            await apiPut(`/companies/${companyId}/employees/${employee.id}`, {
                first_name: formData.first_name,
                last_name: formData.last_name,
                bio: { ...employee.bio, [locale as string]: formData.bio },
                email: formData.email || null,
                phone: formData.phone || null,
            });
            onSuccess();
        } catch (err) {
            console.error("Save error:", err);
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = async () => {
        if (!employee || !companyId) return;

        try {
            await apiDelete(`/companies/${companyId}/employees/${employee.id}`);
            setConfirmRemove(false);
            onSuccess();
        } catch (err) {
            console.error("Remove error:", err);
        }
    };

    const getLocalizedText = (obj: Record<string, string> | null | undefined): string => {
        if (!obj) return "";
        return obj[locale as string] || obj.fr || Object.values(obj)[0] || "";
    };

    const levelLabels: Record<string, Record<string, string>> = {
        MANAGER: { fr: "Dirigeant", en: "Manager" },
        N: { fr: "Co-Président", en: "Co-President" },
        "N-1": { fr: "Directeur", en: "Director" },
        "N-2": { fr: "Collaborateur", en: "Employee" },
    };

    if (!employee) return null;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <User className="w-5 h-5" />
                            {locale === "fr" ? "Modifier l'employé" : "Edit Employee"}
                        </DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Readonly info */}
                        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                            <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center">
                                {employee.portrait_uri ? (
                                    <Image
                                        src={employee.portrait_uri}
                                        alt={`${employee.first_name} ${employee.last_name}`}
                                        width={64}
                                        height={64}
                                        className="object-cover w-full h-full"
                                    />
                                ) : (
                                    <User className="w-8 h-8 text-muted-foreground" />
                                )}
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary">
                                        {employee.level ? levelLabels[employee.level]?.[locale as "fr" | "en"] || employee.level : "—"}
                                    </Badge>
                                    <Lock className="w-3 h-3 text-muted-foreground" />
                                </div>
                                {employee.role && (
                                    <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
                                        <Lock className="w-3 h-3" />
                                        {getLocalizedText(employee.role)}
                                    </p>
                                )}
                            </div>
                        </div>

                        <Separator />

                        {/* Editable fields */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="first_name">
                                    {locale === "fr" ? "Prénom" : "First name"}
                                </Label>
                                <Input
                                    id="first_name"
                                    value={formData.first_name}
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, first_name: e.target.value }))
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="last_name">
                                    {locale === "fr" ? "Nom" : "Last name"}
                                </Label>
                                <Input
                                    id="last_name"
                                    value={formData.last_name}
                                    onChange={(e) =>
                                        setFormData((prev) => ({ ...prev, last_name: e.target.value }))
                                    }
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="bio">Bio</Label>
                            <Textarea
                                id="bio"
                                value={formData.bio}
                                onChange={(e) =>
                                    setFormData((prev) => ({ ...prev, bio: e.target.value }))
                                }
                                rows={3}
                            />
                        </div>

                        {/* Manager-specific fields */}
                        {employee.level === "MANAGER" && (
                            <>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) =>
                                            setFormData((prev) => ({ ...prev, email: e.target.value }))
                                        }
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="phone">
                                        {locale === "fr" ? "Téléphone" : "Phone"}
                                    </Label>
                                    <Input
                                        id="phone"
                                        value={formData.phone}
                                        onChange={(e) =>
                                            setFormData((prev) => ({ ...prev, phone: e.target.value }))
                                        }
                                    />
                                </div>
                            </>
                        )}
                    </div>

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        {employee.is_removable && (
                            <Button
                                variant="destructive"
                                onClick={() => setConfirmRemove(true)}
                                className="sm:mr-auto"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {locale === "fr" ? "Retirer" : "Remove"}
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            {locale === "fr" ? "Annuler" : "Cancel"}
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving
                                ? locale === "fr"
                                    ? "Enregistrement..."
                                    : "Saving..."
                                : locale === "fr"
                                    ? "Enregistrer"
                                    : "Save"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirm Remove Dialog */}
            <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {locale === "fr"
                                ? "Retirer de l'entreprise ?"
                                : "Remove from company?"}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {locale === "fr"
                                ? `${employee.first_name} ${employee.last_name} sera retiré de l'organigramme. Le poste deviendra vacant.`
                                : `${employee.first_name} ${employee.last_name} will be removed from the org chart. The position will become vacant.`}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {locale === "fr" ? "Annuler" : "Cancel"}
                        </AlertDialogCancel>
                        <AlertDialogAction onClick={handleRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {locale === "fr" ? "Retirer" : "Remove"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
