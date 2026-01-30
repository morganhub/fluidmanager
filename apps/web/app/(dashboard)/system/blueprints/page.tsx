"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createTranslator } from "@/lib/i18n";
import { useIsSuperadmin, useHasHydrated } from "@/lib/store";
import {
    getBlueprints,
    createBlueprint,
    updateBlueprint,
    deleteBlueprint,
    getPortraits,
    uploadPortrait,
    deletePortrait,
    Blueprint,
    BlueprintCreate,
    BlueprintUpdate,
    Portrait,
    LocalizedText,
    getLocalizedText,
    SUPPORTED_LOCALES,
    SupportedLocale,
} from "@/lib/api";


import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
    Plus,
    Pencil,
    Trash2,
    Search,
    Layers,
    User,
    Upload,
    X,
    Check,
} from "lucide-react";

// Helper to get full portrait URL
const getPortraitUrl = (uri: string | null | undefined) => {
    if (!uri) return null;
    if (uri.startsWith("http")) return uri;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:18000";
    // Remove trailing slash from apiUrl if present and leading slash from uri if present to avoid double slash
    const cleanApiUrl = apiUrl.replace(/\/$/, "");
    const cleanUri = uri.startsWith("/") ? uri : `/${uri}`;
    return `${cleanApiUrl}${cleanUri}`;
};

export default function BlueprintsPage() {
    const router = useRouter();
    const t = createTranslator("fr");
    const isSuperadmin = useIsSuperadmin();
    const hasHydrated = useHasHydrated();
    const queryClient = useQueryClient();

    const [search, setSearch] = useState("");
    const [levelFilter, setLevelFilter] = useState<string | undefined>();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingBlueprint, setEditingBlueprint] = useState<Blueprint | null>(null);
    const [portraitDialogOpen, setPortraitDialogOpen] = useState(false);

    // Helper to get full portrait URL
    const getPortraitUrl = (uri: string | null | undefined) => {
        if (!uri) return null;
        if (uri.startsWith("http")) return uri;
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:18000";
        // Remove trailing slash from apiUrl if present and leading slash from uri if present to avoid double slash
        const cleanApiUrl = apiUrl.replace(/\/$/, "");
        const cleanUri = uri.startsWith("/") ? uri : `/${uri}`;
        return `${cleanApiUrl}${cleanUri}`;
    };

    // Redirect if not superadmin after hydration
    useEffect(() => {
        if (hasHydrated && !isSuperadmin) {
            router.push("/dashboard");
        }
    }, [isSuperadmin, hasHydrated, router]);

    // Fetch blueprints
    const { data: blueprintsData, isLoading } = useQuery({
        queryKey: ["blueprints", search, levelFilter],
        queryFn: () => getBlueprints({ search, level: levelFilter }),
        enabled: hasHydrated && isSuperadmin,
    });

    // Fetch portraits for picker
    const { data: portraitsData } = useQuery({
        queryKey: ["portraits"],
        queryFn: () => getPortraits(),
        enabled: hasHydrated && isSuperadmin,
    });

    // Mutations
    const createMutation = useMutation({
        mutationFn: createBlueprint,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["blueprints"] });
            setDialogOpen(false);
        },
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: BlueprintUpdate }) =>
            updateBlueprint(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["blueprints"] });
            setDialogOpen(false);
            setEditingBlueprint(null);
        },
    });

    const deleteMutation = useMutation({
        mutationFn: deleteBlueprint,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["blueprints"] });
        },
    });

    const uploadMutation = useMutation({
        mutationFn: uploadPortrait,
        onSuccess: (newPortrait) => {
            queryClient.invalidateQueries({ queryKey: ["portraits"] });
            // Return the new portrait so it can be selected
            return newPortrait;
        },
    });

    const deletePortraitMutation = useMutation({
        mutationFn: deletePortrait,
        // Optimistic update - remove from cache immediately
        onMutate: async (deletedId) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: ["portraits"] });

            // Snapshot the previous value
            const previousPortraits = queryClient.getQueryData(["portraits"]);

            // Optimistically update to the new value
            queryClient.setQueryData(["portraits"], (old: { items: Portrait[], total: number } | undefined) => {
                if (!old) return old;
                return {
                    ...old,
                    items: old.items.filter(p => p.id !== deletedId),
                    total: old.total - 1,
                };
            });

            return { previousPortraits };
        },
        onError: (_err, _deletedId, context) => {
            // Rollback on error
            if (context?.previousPortraits) {
                queryClient.setQueryData(["portraits"], context.previousPortraits);
            }
        },
        onSettled: () => {
            // Always refetch after error or success
            queryClient.invalidateQueries({ queryKey: ["portraits"] });
        },
    });

    function handleCreate() {
        setEditingBlueprint(null);
        setDialogOpen(true);
    }

    function handleEdit(blueprint: Blueprint) {
        setEditingBlueprint(blueprint);
        setDialogOpen(true);
    }

    function handleDelete(id: string) {
        if (confirm("Êtes-vous sûr de vouloir désactiver ce blueprint ?")) {
            deleteMutation.mutate(id);
        }
    }

    // Loading state
    if (!hasHydrated) {
        return (
            <div className="space-y-6">
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-[400px] w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-fm-blue to-fm-purple bg-clip-text text-transparent">
                        {t("blueprint.title")}
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        {t("blueprint.description")}
                    </p>
                </div>
                <Button onClick={handleCreate} className="gap-2">
                    <Plus size={18} />
                    {t("blueprint.createNew")}
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex gap-4">
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                            <Input
                                placeholder={t("common.search")}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={levelFilter || "all"} onValueChange={(v) => setLevelFilter(v === "all" ? undefined : v)}>
                            <SelectTrigger className="w-48">
                                <SelectValue placeholder={t("blueprint.level")} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t("common.all")}</SelectItem>
                                <SelectItem value="N">{t("blueprint.levels.N")}</SelectItem>
                                <SelectItem value="N-1">{t("blueprint.levels.N-1")}</SelectItem>
                                <SelectItem value="N-2">{t("blueprint.levels.N-2")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Blueprints Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-12"></TableHead>
                                <TableHead>{t("blueprint.code")}</TableHead>
                                <TableHead>{t("blueprint.role")}</TableHead>
                                <TableHead>{t("blueprint.level")}</TableHead>
                                <TableHead>{t("blueprint.skills")}</TableHead>
                                <TableHead>{t("common.status")}</TableHead>
                                <TableHead className="text-right">{t("common.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <TableRow key={i}>
                                        <TableCell><Skeleton className="h-10 w-10 rounded-full" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                                        <TableCell><Skeleton className="h-8 w-20 ml-auto" /></TableCell>
                                    </TableRow>
                                ))
                            ) : blueprintsData?.items.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                                        <Layers className="mx-auto mb-4 opacity-50" size={48} />
                                        {t("blueprint.noBlueprints")}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                blueprintsData?.items.map((bp) => (
                                    <TableRow key={bp.id}>
                                        <TableCell>
                                            {bp.default_portrait_uri ? (
                                                <img
                                                    src={getPortraitUrl(bp.default_portrait_uri)!}
                                                    alt=""
                                                    className="w-10 h-10 rounded-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-fm-blue to-fm-purple flex items-center justify-center text-white text-sm font-medium">
                                                    {bp.default_first_name?.[0]}{bp.default_last_name?.[0]}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">{bp.code}</TableCell>
                                        <TableCell className="font-medium">{getLocalizedText(bp.role)}</TableCell>

                                        <TableCell>
                                            <Badge variant={bp.level === "N" ? "default" : bp.level === "N-1" ? "secondary" : "outline"}>
                                                {t(`blueprint.levels.${bp.level}`)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1 flex-wrap max-w-xs">
                                                {bp.skills.slice(0, 3).map((skill) => (
                                                    <Badge key={skill} variant="outline" className="text-xs">
                                                        {skill}
                                                    </Badge>
                                                ))}
                                                {bp.skills.length > 3 && (
                                                    <Badge variant="outline" className="text-xs">
                                                        +{bp.skills.length - 3}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={bp.is_active ? "default" : "destructive"}>
                                                {bp.is_active ? t("common.active") : t("common.inactive")}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex gap-2 justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleEdit(bp)}
                                                >
                                                    <Pencil size={16} />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(bp.id)}
                                                    disabled={deleteMutation.isPending}
                                                >
                                                    <Trash2 size={16} />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Create/Edit Dialog */}
            <BlueprintDialog
                open={dialogOpen}
                onOpenChange={setDialogOpen}
                blueprint={editingBlueprint}
                blueprints={blueprintsData?.items || []}
                portraits={portraitsData?.items || []}
                onSave={(data) => {
                    if (editingBlueprint) {
                        updateMutation.mutate({ id: editingBlueprint.id, data });
                    } else {
                        createMutation.mutate(data as BlueprintCreate);
                    }
                }}
                onUploadPortrait={(file) => uploadMutation.mutateAsync(file)}
                onDeletePortrait={(id) => deletePortraitMutation.mutateAsync(id)}
                isLoading={createMutation.isPending || updateMutation.isPending}
                t={t}
            />
        </div>
    );
}

// =============================================================================
// Blueprint Dialog Component
// =============================================================================

interface BlueprintDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    blueprint: Blueprint | null;
    blueprints: Blueprint[];
    portraits: Portrait[];
    onSave: (data: BlueprintCreate | BlueprintUpdate) => void;
    onUploadPortrait: (file: File) => Promise<Portrait>;
    onDeletePortrait: (id: string) => Promise<void>;
    isLoading: boolean;
    t: (key: string) => string;
}

function BlueprintDialog({
    open,
    onOpenChange,
    blueprint,
    blueprints,
    portraits,
    onSave,
    onUploadPortrait,
    onDeletePortrait,
    isLoading,
    t,
}: BlueprintDialogProps) {
    // Current editing language
    const [currentLocale, setCurrentLocale] = useState<SupportedLocale>("fr");

    const [formData, setFormData] = useState<Partial<BlueprintCreate>>({
        code: "",
        role: { fr: "", en: "" },
        level: "N-2",
        default_first_name: "",
        default_last_name: "",
        default_bio: { fr: "", en: "" },
        skills: [],
        system_prompt: { fr: "", en: "" },
        webhooks: { review: null, meeting: null, task: null },
        parent_blueprint_ids: [],
        child_blueprint_ids: [],
    });
    const [skillInput, setSkillInput] = useState("");
    const [selectedPortraitId, setSelectedPortraitId] = useState<string | null>(null);
    const [showPortraitPicker, setShowPortraitPicker] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Helper to update a localized field
    const updateLocalizedField = (
        field: "role" | "default_bio" | "system_prompt",
        value: string
    ) => {
        setFormData({
            ...formData,
            [field]: {
                ...(formData[field] as LocalizedText || {}),
                [currentLocale]: value,
            },
        });
    };

    // Helper to get value from localized field
    const getLocalizedValue = (field: "role" | "default_bio" | "system_prompt"): string => {
        const data = formData[field];
        if (!data) return "";
        if (typeof data === "string") return data; // Backward compat
        return (data as LocalizedText)[currentLocale] || "";
    };


    // Reset form when dialog opens
    useEffect(() => {
        if (open) {
            if (blueprint) {
                // Editing existing blueprint - use its data
                setFormData({
                    code: blueprint.code,
                    role: blueprint.role || { fr: "", en: "" },
                    level: blueprint.level,
                    default_first_name: blueprint.default_first_name,
                    default_last_name: blueprint.default_last_name,
                    default_bio: blueprint.default_bio || { fr: "", en: "" },
                    skills: blueprint.skills,
                    system_prompt: blueprint.system_prompt || { fr: "", en: "" },
                    webhooks: blueprint.webhooks,
                    parent_blueprint_ids: blueprint.parent_blueprints.map(p => p.id),
                    child_blueprint_ids: blueprint.child_blueprints.map(c => c.id),
                });
                setSelectedPortraitId(blueprint.default_portrait_id);
            } else {
                // Creating new blueprint - use empty LocalizedText
                setFormData({
                    code: "",
                    role: { fr: "", en: "" },
                    level: "N-2",
                    default_first_name: "",
                    default_last_name: "",
                    default_bio: { fr: "", en: "" },
                    skills: [],
                    system_prompt: { fr: "", en: "" },
                    webhooks: { review: null, meeting: null, task: null },
                    parent_blueprint_ids: [],
                    child_blueprint_ids: [],
                });
                setSelectedPortraitId(null);
            }
            setSkillInput("");
            setCurrentLocale("fr"); // Reset to French when opening
        }
    }, [open, blueprint]);


    function addSkill() {
        if (skillInput.trim() && !formData.skills?.includes(skillInput.trim())) {
            setFormData({
                ...formData,
                skills: [...(formData.skills || []), skillInput.trim()],
            });
            setSkillInput("");
        }
    }

    function removeSkill(skill: string) {
        setFormData({
            ...formData,
            skills: formData.skills?.filter(s => s !== skill) || [],
        });
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            const portrait = await onUploadPortrait(file);
            setSelectedPortraitId(portrait.id);
        } catch (error) {
            console.error("Upload failed:", error);
        } finally {
            setUploading(false);
        }
    }

    function handleSubmit() {
        onSave({
            ...formData,
            default_portrait_id: selectedPortraitId,
        } as BlueprintCreate);
    }

    // Get available blueprints for relations based on level
    const parentOptions = blueprints.filter(bp =>
        bp.level === "N-1" && bp.id !== blueprint?.id
    );
    const childOptions = blueprints.filter(bp =>
        bp.level === "N-2" && bp.id !== blueprint?.id
    );

    const selectedPortrait = portraits.find(p => p.id === selectedPortraitId);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {blueprint ? t("blueprint.editBlueprint") : t("blueprint.createNew")}
                    </DialogTitle>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    {/* Language Switcher */}
                    <div className="flex items-center justify-end gap-2 p-2 bg-muted/50 rounded-lg">
                        <span className="text-sm text-muted-foreground mr-2">
                            Langue d'édition :
                        </span>
                        {SUPPORTED_LOCALES.map((locale) => (
                            <Button
                                key={locale}
                                type="button"
                                variant={currentLocale === locale ? "default" : "outline"}
                                size="sm"
                                onClick={() => setCurrentLocale(locale)}
                                className="min-w-12"
                            >
                                {locale.toUpperCase()}
                            </Button>
                        ))}
                    </div>

                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t("blueprint.code")}</Label>
                            <Input
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                placeholder="dev-senior"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>
                                {t("blueprint.role")}
                                <span className="ml-2 text-xs text-muted-foreground">({currentLocale.toUpperCase()})</span>
                            </Label>
                            <Input
                                value={getLocalizedValue("role")}
                                onChange={(e) => updateLocalizedField("role", e.target.value)}
                                placeholder={currentLocale === "fr" ? "Développeur Senior" : "Senior Developer"}
                            />
                        </div>
                    </div>


                    <div className="space-y-2">
                        <Label>{t("blueprint.level")}</Label>
                        <Select
                            value={formData.level}
                            onValueChange={(v) => setFormData({ ...formData, level: v as "N" | "N-1" | "N-2" })}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="N">{t("blueprint.levels.N")}</SelectItem>
                                <SelectItem value="N-1">{t("blueprint.levels.N-1")}</SelectItem>
                                <SelectItem value="N-2">{t("blueprint.levels.N-2")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Identity */}
                    <div className="space-y-4">
                        <h3 className="font-medium">{t("blueprint.identity")}</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t("blueprint.firstName")}</Label>
                                <Input
                                    value={formData.default_first_name}
                                    onChange={(e) => setFormData({ ...formData, default_first_name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("blueprint.lastName")}</Label>
                                <Input
                                    value={formData.default_last_name}
                                    onChange={(e) => setFormData({ ...formData, default_last_name: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>
                                {t("blueprint.bio")}
                                <span className="ml-2 text-xs text-muted-foreground">({currentLocale.toUpperCase()})</span>
                            </Label>
                            <Textarea
                                value={getLocalizedValue("default_bio")}
                                onChange={(e) => updateLocalizedField("default_bio", e.target.value)}
                                rows={3}
                                placeholder={currentLocale === "fr" ? "Biographie..." : "Biography..."}
                            />
                        </div>


                        {/* Portrait Picker */}
                        <div className="space-y-2">
                            <Label>{t("blueprint.portrait")}</Label>
                            <div className="flex items-center gap-4">
                                {selectedPortrait ? (
                                    <div className="relative">
                                        <img
                                            src={getPortraitUrl(selectedPortrait.uri)!}
                                            alt=""
                                            className="w-16 h-16 rounded-full object-cover"
                                        />
                                        <button
                                            type="button"
                                            className="absolute -top-1 -right-1 bg-destructive text-white rounded-full p-0.5"
                                            onClick={() => setSelectedPortraitId(null)}
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                                        <User size={24} className="text-muted-foreground" />
                                    </div>
                                )}
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowPortraitPicker(!showPortraitPicker)}
                                    >
                                        {t("blueprint.selectPortrait")}
                                    </Button>
                                    <Label className="cursor-pointer">
                                        <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
                                            <span>
                                                <Upload size={14} className="mr-1" />
                                                {uploading ? "..." : t("blueprint.uploadPortrait")}
                                            </span>
                                        </Button>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={handleFileUpload}
                                        />
                                    </Label>
                                </div>
                            </div>

                            {/* Portrait Grid */}
                            {showPortraitPicker && (
                                <div className="grid grid-cols-8 gap-2 p-4 border rounded-lg bg-muted/50 mt-2">
                                    {portraits.map((p) => (
                                        <div key={p.id} className="relative group">
                                            <button
                                                type="button"
                                                className={`relative rounded-full overflow-hidden border-2 transition-all ${selectedPortraitId === p.id
                                                    ? "border-primary ring-2 ring-primary/20"
                                                    : "border-transparent hover:border-muted-foreground/30"
                                                    }`}
                                                onClick={() => {
                                                    setSelectedPortraitId(p.id);
                                                    setShowPortraitPicker(false);
                                                }}
                                            >
                                                <img src={getPortraitUrl(p.uri)!} alt="" className="w-12 h-12 object-cover" />
                                                {selectedPortraitId === p.id && (
                                                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                                                        <Check size={16} className="text-primary" />
                                                    </div>
                                                )}
                                            </button>
                                            {/* Delete button */}
                                            <button
                                                type="button"
                                                className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-destructive/90"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (confirm("Supprimer ce portrait ?")) {
                                                        onDeletePortrait(p.id);
                                                        if (selectedPortraitId === p.id) {
                                                            setSelectedPortraitId(null);
                                                        }
                                                    }
                                                }}
                                                title="Supprimer"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Skills */}
                    <div className="space-y-2">
                        <Label>{t("blueprint.skills")}</Label>
                        <div className="flex gap-2">
                            <Input
                                value={skillInput}
                                onChange={(e) => setSkillInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSkill())}
                                placeholder="Ajouter une compétence..."
                            />
                            <Button type="button" variant="secondary" onClick={addSkill}>
                                <Plus size={16} />
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                            {formData.skills?.map((skill) => (
                                <Badge key={skill} variant="secondary" className="gap-1">
                                    {skill}
                                    <button type="button" onClick={() => removeSkill(skill)}>
                                        <X size={12} />
                                    </button>
                                </Badge>
                            ))}
                        </div>
                    </div>

                    {/* System Prompt */}
                    <div className="space-y-2">
                        <Label>
                            {t("blueprint.systemPrompt")}
                            <span className="ml-2 text-xs text-muted-foreground">({currentLocale.toUpperCase()})</span>
                        </Label>
                        <Textarea
                            value={getLocalizedValue("system_prompt")}
                            onChange={(e) => updateLocalizedField("system_prompt", e.target.value)}
                            rows={6}
                            className="font-mono text-sm"
                            placeholder={currentLocale === "fr" ? "Tu es un développeur senior..." : "You are a senior developer..."}
                        />
                    </div>


                    {/* Webhooks */}
                    <div className="space-y-4">
                        <h3 className="font-medium">{t("blueprint.webhooks")}</h3>
                        <div className="grid gap-3">
                            <div className="space-y-2">
                                <Label>{t("blueprint.webhookReview")}</Label>
                                <Input
                                    value={formData.webhooks?.review || ""}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        webhooks: { ...formData.webhooks, review: e.target.value || null },
                                    })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("blueprint.webhookMeeting")}</Label>
                                <Input
                                    value={formData.webhooks?.meeting || ""}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        webhooks: { ...formData.webhooks, meeting: e.target.value || null },
                                    })}
                                    placeholder="https://..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t("blueprint.webhookTask")}</Label>
                                <Input
                                    value={formData.webhooks?.task || ""}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        webhooks: { ...formData.webhooks, task: e.target.value || null },
                                    })}
                                    placeholder="https://..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Relations - show based on level */}
                    {formData.level === "N-2" && parentOptions.length > 0 && (
                        <div className="space-y-2">
                            <Label>{t("blueprint.parentBlueprints")}</Label>
                            <div className="flex flex-wrap gap-2">
                                {parentOptions.map((bp) => (
                                    <Badge
                                        key={bp.id}
                                        variant={formData.parent_blueprint_ids?.includes(bp.id) ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => {
                                            const ids = formData.parent_blueprint_ids || [];
                                            setFormData({
                                                ...formData,
                                                parent_blueprint_ids: ids.includes(bp.id)
                                                    ? ids.filter(id => id !== bp.id)
                                                    : [...ids, bp.id],
                                            });
                                        }}
                                    >
                                        {getLocalizedText(bp.role)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    {formData.level === "N-1" && childOptions.length > 0 && (
                        <div className="space-y-2">
                            <Label>{t("blueprint.childBlueprints")}</Label>
                            <div className="flex flex-wrap gap-2">
                                {childOptions.map((bp) => (
                                    <Badge
                                        key={bp.id}
                                        variant={formData.child_blueprint_ids?.includes(bp.id) ? "default" : "outline"}
                                        className="cursor-pointer"
                                        onClick={() => {
                                            const ids = formData.child_blueprint_ids || [];
                                            setFormData({
                                                ...formData,
                                                child_blueprint_ids: ids.includes(bp.id)
                                                    ? ids.filter(id => id !== bp.id)
                                                    : [...ids, bp.id],
                                            });
                                        }}
                                    >
                                        {getLocalizedText(bp.role)}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t("common.cancel")}
                    </Button>
                    <Button onClick={handleSubmit} disabled={isLoading || !formData.code || !formData.role}>
                        {isLoading ? t("common.loading") : t("common.save")}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
