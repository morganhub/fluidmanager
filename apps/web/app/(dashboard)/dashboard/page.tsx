"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet, type Company, type ListResponse } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { createTranslator } from "@/lib/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Building2,
    Users,
    FolderKanban,
    CheckSquare,
    ArrowRight,
    Activity,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
    const t = createTranslator("fr");
    const { currentCompanyCode, setCurrentCompany } = useAppStore();

    // Fetch companies
    const { data: companiesData, isLoading } = useQuery({
        queryKey: ["companies"],
        queryFn: () => apiGet<ListResponse<Company>>("/companies"),
    });

    const companies = companiesData?.items || [];

    // Auto-select first company if none selected
    if (!currentCompanyCode && companies.length > 0) {
        setCurrentCompany(companies[0].code);
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold">{t("nav.dashboard")}</h1>
                <p className="text-muted-foreground mt-1">{t("auth.welcome")}</p>
            </div>

            {/* Company Selector */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {t("nav.companies")}
                    </CardTitle>
                    <CardDescription>
                        {companies.length} entreprise{companies.length > 1 ? "s" : ""} disponible{companies.length > 1 ? "s" : ""}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <p className="text-muted-foreground">{t("common.loading")}</p>
                    ) : companies.length === 0 ? (
                        <p className="text-muted-foreground">{t("common.noData")}</p>
                    ) : (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {companies.map((company) => (
                                <CompanyCard
                                    key={company.id}
                                    company={company}
                                    isSelected={currentCompanyCode === company.code}
                                    onSelect={() => setCurrentCompany(company.code)}
                                />
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Quick Stats */}
            {currentCompanyCode && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <QuickStatCard
                        icon={Users}
                        label={t("nav.employees")}
                        value="—"
                        href={`/companies/${currentCompanyCode}/employees`}
                    />
                    <QuickStatCard
                        icon={FolderKanban}
                        label={t("nav.projects")}
                        value="—"
                        href={`/companies/${currentCompanyCode}/projects`}
                    />
                    <QuickStatCard
                        icon={CheckSquare}
                        label={t("nav.tasks")}
                        value="—"
                        href={`/companies/${currentCompanyCode}/projects`}
                    />
                    <QuickStatCard
                        icon={Activity}
                        label={t("nav.activity")}
                        value="—"
                        href={`/companies/${currentCompanyCode}/projects`}
                    />
                </div>
            )}
        </div>
    );
}

function CompanyCard({
    company,
    isSelected,
    onSelect,
}: {
    company: Company;
    isSelected: boolean;
    onSelect: () => void;
}) {
    return (
        <div
            onClick={onSelect}
            className={`p-4 rounded-lg border cursor-pointer transition-all ${isSelected
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border hover:border-primary/50 hover:bg-accent/50"
                }`}
        >
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-semibold">{company.name}</h3>
                    <p className="text-sm text-muted-foreground">{company.code}</p>
                </div>
                {isSelected && (
                    <Badge variant="default" className="bg-primary">
                        Actif
                    </Badge>
                )}
            </div>
        </div>
    );
}

function QuickStatCard({
    icon: Icon,
    label,
    value,
    href,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    href: string;
}) {
    return (
        <Link href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardContent className="flex items-center gap-4 p-6">
                    <div className="p-3 rounded-lg bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-2xl font-bold">{value}</p>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
            </Card>
        </Link>
    );
}
