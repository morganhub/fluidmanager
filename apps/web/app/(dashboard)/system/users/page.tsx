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
    Shield,
    User,
    Building2,
    ChevronLeft,
    ChevronRight,
    Loader2,
    Key,
    X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";

interface AdminUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: "superadmin" | "manager";
    organization: string | null;
    valid_until: string | null;
    is_active: boolean;
    created_at: string;
    companies: { id: string; code: string; name: string }[];
}

interface Company {
    id: string;
    code: string;
    name: string;
}

interface AdminUserListResponse {
    items: AdminUser[];
    total: number;
    page: number;
    page_size: number;
}

export default function SystemUsersPage() {
    const t = createTranslator("fr");
    const queryClient = useQueryClient();
    const router = useRouter();
    const isSuperadmin = useIsSuperadmin();
    const hasHydrated = useHasHydrated();

    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [editUser, setEditUser] = useState<AdminUser | null>(null);
    const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
    const [resetPasswordUser, setResetPasswordUser] = useState<AdminUser | null>(null);

    // Redirect if not superadmin after hydration
    useEffect(() => {
        if (hasHydrated && !isSuperadmin) {
            router.push("/dashboard");
        }
    }, [isSuperadmin, hasHydrated, router]);

    // Fetch users
    const { data, isLoading, error } = useQuery({
        queryKey: ["admin-users", page, search],
        queryFn: () => api<AdminUserListResponse>(`/admin/users?page=${page}&page_size=10${search ? `&search=${encodeURIComponent(search)}` : ""}`),
        enabled: isSuperadmin,
    });

    // Create user mutation
    const createMutation = useMutation({
        mutationFn: (userData: { email: string; password: string; first_name: string; last_name: string; role: string; organization?: string }) =>
            apiPost<AdminUser>("/admin/users", userData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setCreateOpen(false);
        },
    });

    // Update user mutation
    const updateMutation = useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<AdminUser> }) =>
            apiPut<AdminUser>(`/admin/users/${id}`, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setEditUser(null);
        },
    });

    // Delete user mutation
    const deleteMutation = useMutation({
        mutationFn: (id: string) => apiDelete(`/admin/users/${id}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
            setDeleteUser(null);
        },
    });

    // Reset password mutation
    const resetPasswordMutation = useMutation({
        mutationFn: ({ id, password }: { id: string; password: string }) =>
            apiPut(`/admin/users/${id}/password?new_password=${encodeURIComponent(password)}`, {}),
        onSuccess: () => {
            setResetPasswordUser(null);
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
                        Gestion des utilisateurs
                    </h1>
                    <p className="text-muted-foreground">
                        Gérez les comptes administrateurs du système
                    </p>
                </div>
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-fm-blue to-fm-purple">
                            <Plus className="mr-2 h-4 w-4" />
                            Nouvel utilisateur
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <CreateUserForm
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
                                placeholder="Rechercher par email, nom, organisation..."
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

            {/* Users Table */}
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
                            <User className="mx-auto h-12 w-12 mb-4 opacity-20" />
                            <p>Aucun utilisateur trouvé</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Utilisateur</TableHead>
                                    <TableHead>Rôle</TableHead>
                                    <TableHead>Organisation</TableHead>
                                    <TableHead>Entreprises</TableHead>
                                    <TableHead>Statut</TableHead>
                                    <TableHead className="w-[100px]">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {data.items.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{user.first_name} {user.last_name}</p>
                                                <p className="text-sm text-muted-foreground">{user.email}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant={user.role === "superadmin" ? "default" : "secondary"}
                                                className={cn(
                                                    user.role === "superadmin" && "bg-gradient-to-r from-fm-blue to-fm-purple"
                                                )}
                                            >
                                                {user.role === "superadmin" ? (
                                                    <><Shield className="mr-1 h-3 w-3" /> Superadmin</>
                                                ) : (
                                                    <><User className="mr-1 h-3 w-3" /> Manager</>
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {user.organization || <span className="text-muted-foreground">-</span>}
                                        </TableCell>
                                        <TableCell>
                                            {user.role === "superadmin" ? (
                                                <span className="text-sm text-muted-foreground italic">Toutes</span>
                                            ) : (
                                                <div className="flex flex-wrap gap-1">
                                                    {user.companies.length === 0 ? (
                                                        <span className="text-muted-foreground">Aucune</span>
                                                    ) : user.companies.slice(0, 3).map((c) => (
                                                        <Badge key={c.id} variant="outline" className="text-xs">
                                                            <Building2 className="mr-1 h-3 w-3" />
                                                            {c.code}
                                                        </Badge>
                                                    ))}
                                                    {user.companies.length > 3 && (
                                                        <Badge variant="outline" className="text-xs">
                                                            +{user.companies.length - 3}
                                                        </Badge>
                                                    )}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={user.is_active ? "default" : "secondary"}>
                                                {user.is_active ? "Actif" : "Inactif"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setEditUser(user)}
                                                >
                                                    <Edit className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setResetPasswordUser(user)}
                                                >
                                                    <Key className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setDeleteUser(user)}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Pagination */}
            {data && totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        {data.total} utilisateur{data.total > 1 ? "s" : ""} au total
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
            <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {editUser && (
                        <EditUserForm
                            user={editUser}
                            onSubmit={(data) => updateMutation.mutate({ id: editUser.id, data })}
                            onClose={() => setEditUser(null)}
                            isLoading={updateMutation.isPending}
                            error={updateMutation.error?.message}
                        />
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Supprimer l&apos;utilisateur</DialogTitle>
                        <DialogDescription>
                            Êtes-vous sûr de vouloir supprimer {deleteUser?.first_name} {deleteUser?.last_name} ?
                            Cette action est irréversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteUser(null)}>
                            Annuler
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
                            disabled={deleteMutation.isPending}
                        >
                            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Supprimer
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Password Dialog */}
            <Dialog open={!!resetPasswordUser} onOpenChange={(open) => !open && setResetPasswordUser(null)}>
                <DialogContent>
                    {resetPasswordUser && (
                        <ResetPasswordForm
                            user={resetPasswordUser}
                            onSubmit={(password) => resetPasswordMutation.mutate({ id: resetPasswordUser.id, password })}
                            isLoading={resetPasswordMutation.isPending}
                            error={resetPasswordMutation.error?.message}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}

// Create User Form
function CreateUserForm({
    onSubmit,
    isLoading,
    error
}: {
    onSubmit: (data: { email: string; password: string; first_name: string; last_name: string; role: string; organization?: string }) => void;
    isLoading: boolean;
    error?: string;
}) {
    const [formData, setFormData] = useState({
        email: "",
        password: "",
        first_name: "",
        last_name: "",
        role: "manager",
        organization: "",
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            ...formData,
            organization: formData.organization || undefined,
        });
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Nouvel utilisateur</DialogTitle>
                <DialogDescription>
                    Créez un nouveau compte administrateur
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="first_name">Prénom</Label>
                        <Input
                            id="first_name"
                            value={formData.first_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="last_name">Nom</Label>
                        <Input
                            id="last_name"
                            value={formData.last_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                            required
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe</Label>
                    <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                        required
                        minLength={6}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="role">Rôle</Label>
                    <Select
                        value={formData.role}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, role: value }))}
                    >
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="manager">Manager</SelectItem>
                            <SelectItem value="superadmin">Superadmin</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="organization">Organisation (optionnel)</Label>
                    <Input
                        id="organization"
                        value={formData.organization}
                        onChange={(e) => setFormData(prev => ({ ...prev, organization: e.target.value }))}
                    />
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

// Edit User Form with Company Assignment
function EditUserForm({
    user,
    onSubmit,
    onClose,
    isLoading,
    error
}: {
    user: AdminUser;
    onSubmit: (data: Partial<AdminUser>) => void;
    onClose: () => void;
    isLoading: boolean;
    error?: string;
}) {
    const queryClient = useQueryClient();

    const [formData, setFormData] = useState({
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role,
        organization: user.organization || "",
        is_active: user.is_active,
    });

    const [assignedCompanies, setAssignedCompanies] = useState<Company[]>(user.companies);
    const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

    // Fetch all companies for the select
    const { data: allCompanies } = useQuery({
        queryKey: ["all-companies"],
        queryFn: () => api<{ items: Company[] }>("/admin/companies?page_size=100"),
    });

    // Mutation to update company assignments
    const assignCompaniesMutation = useMutation({
        mutationFn: (companyIds: string[]) =>
            apiPut(`/admin/users/${user.id}/companies`, { company_ids: companyIds }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["admin-users"] });
        },
    });

    // Get available companies (not already assigned)
    const availableCompanies = allCompanies?.items.filter(
        c => !assignedCompanies.some(ac => ac.id === c.id)
    ) || [];

    const handleAddCompany = () => {
        if (!selectedCompanyId) return;

        const companyToAdd = allCompanies?.items.find(c => c.id === selectedCompanyId);
        if (companyToAdd) {
            const newAssigned = [...assignedCompanies, companyToAdd];
            setAssignedCompanies(newAssigned);
            setSelectedCompanyId("");

            // Update on server
            assignCompaniesMutation.mutate(newAssigned.map(c => c.id));
        }
    };

    const handleRemoveCompany = (companyId: string) => {
        const newAssigned = assignedCompanies.filter(c => c.id !== companyId);
        setAssignedCompanies(newAssigned);

        // Update on server
        assignCompaniesMutation.mutate(newAssigned.map(c => c.id));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({
            ...formData,
            organization: formData.organization || undefined,
        });
    };

    const isManager = formData.role === "manager";

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Modifier l&apos;utilisateur</DialogTitle>
                <DialogDescription>
                    Modifiez les informations de {user.first_name} {user.last_name}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                {/* Basic Info */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit_first_name">Prénom</Label>
                        <Input
                            id="edit_first_name"
                            value={formData.first_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, first_name: e.target.value }))}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="edit_last_name">Nom</Label>
                        <Input
                            id="edit_last_name"
                            value={formData.last_name}
                            onChange={(e) => setFormData(prev => ({ ...prev, last_name: e.target.value }))}
                            required
                        />
                    </div>
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit_email">Email</Label>
                    <Input
                        id="edit_email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                        required
                    />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="edit_role">Rôle</Label>
                        <Select
                            value={formData.role}
                            onValueChange={(value: "superadmin" | "manager") => setFormData(prev => ({ ...prev, role: value }))}
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="manager">Manager</SelectItem>
                                <SelectItem value="superadmin">Superadmin</SelectItem>
                            </SelectContent>
                        </Select>
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
                </div>
                <div className="space-y-2">
                    <Label htmlFor="edit_organization">Organisation</Label>
                    <Input
                        id="edit_organization"
                        value={formData.organization}
                        onChange={(e) => setFormData(prev => ({ ...prev, organization: e.target.value }))}
                    />
                </div>

                {/* Company Assignment Section - Only for Managers */}
                {isManager && (
                    <>
                        <Separator className="my-2" />
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Entreprises assignées</Label>
                                {assignCompaniesMutation.isPending && (
                                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                )}
                            </div>

                            {/* Assigned Companies List */}
                            <div className="flex flex-wrap gap-2 min-h-[40px] p-3 border rounded-md bg-muted/30">
                                {assignedCompanies.length === 0 ? (
                                    <span className="text-sm text-muted-foreground">Aucune entreprise assignée</span>
                                ) : (
                                    assignedCompanies.map((company) => (
                                        <Badge key={company.id} variant="secondary" className="gap-1 pr-1">
                                            <Building2 className="h-3 w-3" />
                                            {company.name} ({company.code})
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-full"
                                                onClick={() => handleRemoveCompany(company.id)}
                                            >
                                                <X className="h-3 w-3" />
                                            </Button>
                                        </Badge>
                                    ))
                                )}
                            </div>

                            {/* Add Company */}
                            <div className="flex gap-2">
                                <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder="Sélectionner une entreprise..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableCompanies.length === 0 ? (
                                            <SelectItem value="_none" disabled>Aucune entreprise disponible</SelectItem>
                                        ) : (
                                            availableCompanies.map((company) => (
                                                <SelectItem key={company.id} value={company.id}>
                                                    {company.name} ({company.code})
                                                </SelectItem>
                                            ))
                                        )}
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    onClick={handleAddCompany}
                                    disabled={!selectedCompanyId || assignCompaniesMutation.isPending}
                                >
                                    <Plus className="h-4 w-4 mr-1" />
                                    Ajouter
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {!isManager && (
                    <div className="p-3 bg-muted/30 rounded-md">
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Les superadmins ont accès à toutes les entreprises
                        </p>
                    </div>
                )}

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

// Reset Password Form
function ResetPasswordForm({
    user,
    onSubmit,
    isLoading,
    error
}: {
    user: AdminUser;
    onSubmit: (password: string) => void;
    isLoading: boolean;
    error?: string;
}) {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [validationError, setValidationError] = useState("");

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setValidationError("Les mots de passe ne correspondent pas");
            return;
        }
        if (password.length < 6) {
            setValidationError("Le mot de passe doit contenir au moins 6 caractères");
            return;
        }
        setValidationError("");
        onSubmit(password);
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
                <DialogDescription>
                    Définissez un nouveau mot de passe pour {user.first_name} {user.last_name}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                    <Label htmlFor="new_password">Nouveau mot de passe</Label>
                    <Input
                        id="new_password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="confirm_password">Confirmer le mot de passe</Label>
                    <Input
                        id="confirm_password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                    />
                </div>
                {(error || validationError) && (
                    <div className="text-sm text-destructive">{error || validationError}</div>
                )}
            </div>
            <DialogFooter>
                <Button type="submit" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Réinitialiser
                </Button>
            </DialogFooter>
        </form>
    );
}
