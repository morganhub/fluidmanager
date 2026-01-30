"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, apiDelete, apiPost, apiPut } from "@/lib/api";
import { useIsSuperadmin, useHasHydrated } from "@/lib/store";
import { createTranslator } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
    Plus,
    Search,
    Edit,
    Trash2,
    Building2,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Users,
    Globe,
    User,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface AssignedUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
}

interface AdminCompany {
    id: string;
    code: string;
    name: string;
    legal_name: string | null;
    tagline: string | null;
    website_url: string | null;
    country_code: string;
    siret: string | null;
    locale: string;
    timezone: string;
    currency: string;
    is_active: boolean;
    created_at: string;
    assigned_users: AssignedUser[];
}

interface AdminUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: "superadmin" | "manager";
}

interface AdminCompanyListResponse {
    items: AdminCompany[];
    total: number;
    page: number;
    page_size: number;
}

export default function SystemCompaniesPage() {
    const t = createTranslator("fr");
    const queryClient = useQueryClient();
    const router = useRouter();
    const isSuperadmin = useIsSuperadmin();
    const hasHydrated = useHasHydrated();

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [editCompany, setEditCompany] = useState<AdminCompany | null>(null);
    const [deleteCompany, setDeleteCompany] = useState<AdminCompany | null>(null);

    // Redirect if not superadmin after hydration
    useEffect(() => {
        if (hasHydrated && !isSuperadmin) {
            router.push("/dashboard");
        }
    }, [isSuperadmin, hasHydrated, router]);

    // Fetch companies
    const { data, isLoading, error } = useQuery({
        queryKey: ["admin-companies", page, search],
        queryFn: () => api<AdminCompanyListResponse>(`/admin/companies?page=${page}&page_size=10${search ? `&search=${encodeURIComponent(search)}` : ""}`),
        enabled: isSuperadmin,
    });

    // Create company mutation
    const createMutation = useMutation({
        mutationFn: (companyData: { code: string; name: string; legal_name?: string; website_url?: string; country_code?: string; siret?: string }) =>
            apiPost<AdminCompany>("/admin/companies", companyData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
            setCreateOpen(false);
        },
    });

    // Update company mutation
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AdminCompany> }) =>
            apiPut<AdminCompany>(`/admin/companies/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
            setEditCompany(null);
        },
    });

    // Delete company mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiDelete(`/admin/companies/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
            setDeleteCompany(null);
        },
    });

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setSearch(searchInput);
        setPage(1);
    };

    const totalPages = data ? Math.ceil(data.total / data.page_size) : 1;

    if (!hasHydrated || (!isSuperadmin && hasHydrated)) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-fm-blue" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-fm-blue to-fm-purple bg-clip-text text-transparent">
                        Gestion des entreprises
                    </h1>
                    <p className="text-muted-foreground">
                        Créez et gérez les entreprises du système
                    </p>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-fm-blue to-fm-purple">
                            <Plus className="mr-2 h-4 w-4" />
                            Nouvelle entreprise
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                        <CreateCompanyForm
                            onSubmit={(data) => createMutation.mutate(data)}
                            isLoading={createMutation.isPending}
                            error={createMutation.error?.message}
                        />
                    </DialogContent>
                </Dialog>
            </div>

            {/* Search */}
            <Card>
                <CardContent className="pt-6">
                    <form onSubmit={handleSearch} className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Rechercher par code, nom..."
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Button type="submit" variant="secondary">
                            Rechercher
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Companies Table */}
            <Card>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(5)].map((_, i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="p-6 text-center text-destructive">
                            Erreur lors du chargement: {error.message}
                        </div>
                    ) : !data?.items.length ? (
                        <div className="p-12 text-center text-muted-foreground">
                            <Building2 className="mx-auto h-12 w-12 mb-4 opacity-20" />
                            <p>Aucune entreprise trouvée</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Entreprise</TableHead>
                                    <TableHead>Code</TableHead>
                                    <TableHead>Pays</TableHead>
                                    <TableHead>Managers assignés</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.items.map((company) => {
                                    // Filter only managers (not superadmins)
                                    const managers = company.assigned_users.filter(u => u.role === "manager");

                                    return (
                                        <TableRow key={company.id}>
                                            <TableCell>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-fm-blue/10 to-fm-purple/10 flex items-center justify-center">
                                                        <Building2 className="h-5 w-5 text-fm-blue" />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium">{company.name}</p>
                                                        {company.legal_name && (
                                                            <p className="text-xs text-muted-foreground">{company.legal_name}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{company.code}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                                    {company.country_code}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1">
                                                    {managers.length === 0 ? (
                                                        <span className="text-muted-foreground">Aucun</span>
                                                    ) : (
                                                        <>
                                                            <Badge variant="secondary" className="text-xs">
                                                                <Users className="mr-1 h-3 w-3" />
                                                                {managers.length}
                                                            </Badge>
                                                            {managers.slice(0, 2).map((u) => (
                                                                <Badge key={u.id} variant="outline" className="text-xs">
                                                                    {u.first_name[0]}{u.last_name[0]}
                                                                </Badge>
                                                            ))}
                                                            {managers.length > 2 && (
                                                                <Badge variant="outline" className="text-xs">
                                                                    +{managers.length - 2}
                                                                </Badge>
                                                            )}
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={company.is_active ? "default" : "secondary"}>
                                                    {company.is_active ? "Actif" : "Inactif"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setEditCompany(company)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setDeleteCompany(company)}
                                                        className="text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {data && totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {data.total} entreprise{data.total > 1 ? "s" : ""} au total
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-sm">
                            Page {page} sur {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Edit Dialog */}
            <Dialog open={!!editCompany} onOpenChange={(open) => !open && setEditCompany(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {editCompany && (
                        <EditCompanyForm
                            company={editCompany}
                            onSubmit={(data) => updateMutation.mutate({ id: editCompany.id, data })}
                            onClose={() => setEditCompany(null)}
                            isLoading={updateMutation.isPending}
                            error={updateMutation.error?.message}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deleteCompany} onOpenChange={(open) => !open && setDeleteCompany(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer l&apos;entreprise</DialogTitle>
                        <DialogDescription>
                            Êtes-vous sûr de vouloir supprimer &quot;{deleteCompany?.name}&quot; ({deleteCompany?.code}) ?
                            Cette action est irréversible et supprimera toutes les données associées.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteCompany(null)}>
                            Annuler
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteCompany && deleteMutation.mutate(deleteCompany.id)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Create Company Form
function CreateCompanyForm({
    onSubmit,
    isLoading,
    error
}: {
    onSubmit: (data: { code: string; name: string; legal_name?: string; website_url?: string; country_code?: string; siret?: string }) => void;
    isLoading: boolean;
    error?: string;
}) {
    const [formData, setFormData] = useState({
        code: "",
        name: "",
        legal_name: "",
        website_url: "",
        country_code: "FR",
        siret: "",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            code: formData.code.toUpperCase(),
            name: formData.name,
            legal_name: formData.legal_name || undefined,
            website_url: formData.website_url || undefined,
            country_code: formData.country_code,
            siret: formData.siret || undefined,
        });
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Nouvelle entreprise</DialogTitle>
                <DialogDescription>
                    Créez une nouvelle entreprise dans le système
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="code">Code *</Label>
                        <Input
                            id="code"
                            value={formData.code}
                            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                            placeholder="ABC"
                            required
                            maxLength={10}
                        />
                        <p className="text-xs text-muted-foreground">Identifiant unique (max 10 caractères)</p>
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="country_code">Pays</Label>
                        <Select
                            value={formData.country_code}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, country_code: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FR">France</SelectItem>
                                <SelectItem value="BE">Belgique</SelectItem>
                                <SelectItem value="CH">Suisse</SelectItem>
                                <SelectItem value="CA">Canada</SelectItem>
                                <SelectItem value="US">États-Unis</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="name">Nom commercial *</Label>
                    <Input
                        id="name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Ma Société"
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="legal_name">Raison sociale</Label>
                    <Input
                        id="legal_name"
                        value={formData.legal_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                        placeholder="Ma Société SAS"
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="siret">SIRET</Label>
                        <Input
                            id="siret"
                            value={formData.siret}
                            onChange={(e) => setFormData(prev => ({ ...prev, siret: e.target.value }))}
                            placeholder="12345678901234"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="website_url">Site web</Label>
                        <Input
                            id="website_url"
                            type="url"
                            value={formData.website_url}
                            onChange={(e) => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                            placeholder="https://example.com"
                        />
                    </div>
                </div>
                {error && (
                    <div className="text-sm text-destructive">{error}</div>
                )}
            </div>
            <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer
                </Button>
            </DialogFooter>
        </form>
    );
}

// Edit Company Form with Manager Assignment
function EditCompanyForm({
    company,
    onSubmit,
    onClose,
    isLoading,
    error
}: {
    company: AdminCompany;
    onSubmit: (data: Partial<AdminCompany>) => void;
    onClose: () => void;
    isLoading: boolean;
    error?: string;
}) {
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        code: company.code,
        name: company.name,
        legal_name: company.legal_name || "",
        website_url: company.website_url || "",
        country_code: company.country_code,
        siret: company.siret || "",
        is_active: company.is_active,
    });

    // Only managers (not superadmins)
    const [assignedManagers, setAssignedManagers] = useState<AssignedUser[]>(
        company.assigned_users.filter(u => u.role === "manager")
    );
    const [selectedUserId, setSelectedUserId] = useState<string>("");

    // Fetch all managers (exclude superadmins)
    const { data: allUsers } = useQuery({
        queryKey: ["all-managers"],
        queryFn: async () => {
            const response = await api<{ items: AdminUser[] }>("/admin/users?page_size=100");
            // Filter only managers
            return {
                items: response.items.filter(u => u.role === "manager")
            };
        },
    });

    // Mutation to update user assignments
    const assignUsersMutation = useMutation({
        mutationFn: (userIds: string[]) =>
            apiPut(`/admin/companies/${company.id}/users`, { user_ids: userIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
        },
    });

    // Get available managers (not already assigned)
    const availableManagers = allUsers?.items.filter(
        u => !assignedManagers.some(am => am.id === u.id)
    ) || [];

    const handleAddManager = () => {
        if (!selectedUserId) return;

        const userToAdd = allUsers?.items.find(u => u.id === selectedUserId);
        if (userToAdd) {
            const newAssigned = [...assignedManagers, { ...userToAdd, role: "manager" }];
            setAssignedManagers(newAssigned);
            setSelectedUserId("");

            // Update on server
            assignUsersMutation.mutate(newAssigned.map(u => u.id));
        }
    };

    const handleRemoveManager = (userId: string) => {
        const newAssigned = assignedManagers.filter(u => u.id !== userId);
        setAssignedManagers(newAssigned);

        // Update on server
        assignUsersMutation.mutate(newAssigned.map(u => u.id));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            code: formData.code.toUpperCase(),
            name: formData.name,
            legal_name: formData.legal_name || undefined,
            website_url: formData.website_url || undefined,
            country_code: formData.country_code,
            siret: formData.siret || undefined,
            is_active: formData.is_active,
        });
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Modifier l&apos;entreprise</DialogTitle>
                <DialogDescription>
                    Modifiez les informations de {company.name}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit_code">Code</Label>
                        <Input
                            id="edit_code"
                            value={formData.code}
                            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                            required
                            maxLength={10}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit_country_code">Pays</Label>
                        <Select
                            value={formData.country_code}
                            onValueChange={(value) => setFormData(prev => ({ ...prev, country_code: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FR">France</SelectItem>
                                <SelectItem value="BE">Belgique</SelectItem>
                                <SelectItem value="CH">Suisse</SelectItem>
                                <SelectItem value="CA">Canada</SelectItem>
                                <SelectItem value="US">États-Unis</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit_name">Nom commercial</Label>
                    <Input
                        id="edit_name"
                        value={formData.name}
                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit_legal_name">Raison sociale</Label>
                    <Input
                        id="edit_legal_name"
                        value={formData.legal_name}
                        onChange={(e) => setFormData(prev => ({ ...prev, legal_name: e.target.value }))}
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit_siret">SIRET</Label>
                        <Input
                            id="edit_siret"
                            value={formData.siret}
                            onChange={(e) => setFormData(prev => ({ ...prev, siret: e.target.value }))}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit_website_url">Site web</Label>
                        <Input
                            id="edit_website_url"
                            type="url"
                            value={formData.website_url}
                            onChange={(e) => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit_status">Statut</Label>
                    <Select
                        value={formData.is_active ? "active" : "inactive"}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, is_active: value === "active" }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="active">Actif</SelectItem>
                            <SelectItem value="inactive">Inactif</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Manager Assignment Section */}
                <Separator className="my-2" />
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Managers assignés</Label>
                        {assignUsersMutation.isPending && (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Les superadmins ont automatiquement accès à cette entreprise.
                    </p>

                    {/* Assigned Managers List */}
                    <div className="flex flex-wrap gap-2 min-h-[40px] p-3 border rounded-md bg-muted/30">
                        {assignedManagers.length === 0 ? (
                            <span className="text-sm text-muted-foreground">Aucun manager assigné</span>
                        ) : (
                            assignedManagers.map((manager) => (
                                <Badge key={manager.id} variant="secondary" className="gap-1 pr-1">
                                    <User className="h-3 w-3" />
                                    {manager.first_name} {manager.last_name}
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                                        onClick={() => handleRemoveManager(manager.id)}
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </Badge>
                            ))
                        )}
                    </div>

                    {/* Add Manager */}
                    <div className="flex gap-2">
                        <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                            <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Sélectionner un manager..." />
                            </SelectTrigger>
                            <SelectContent>
                                {availableManagers.length === 0 ? (
                                    <SelectItem value="_none" disabled>Aucun manager disponible</SelectItem>
                                ) : (
                                    availableManagers.map((manager) => (
                                        <SelectItem key={manager.id} value={manager.id}>
                                            {manager.first_name} {manager.last_name} ({manager.email})
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={handleAddManager}
                            disabled={!selectedUserId || assignUsersMutation.isPending}
                        >
                            <Plus className="h-4 w-4 mr-1" />
                            Ajouter
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="text-sm text-destructive">{error}</div>
                )}
            </div>
            <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enregistrer
                </Button>
            </DialogFooter>
        </form>
    );
}
