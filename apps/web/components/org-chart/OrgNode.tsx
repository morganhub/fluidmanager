"use client";

import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Plus, User, Crown, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface OrgNodeData {
    position: {
        id: string;
        level: string;
        position_index: number;
        parent_position_id: string | null;
    };
    employee: {
        id: string;
        first_name: string;
        last_name: string;
        portrait_uri: string | null;
        role: Record<string, string> | null;
        is_removable: boolean;
    } | null;
    isManager?: boolean;
    isCoPresident?: boolean;
    locale: string;
    onEmptyClick: () => void;
    onEmployeeClick: () => void;
}

interface OrgNodeProps {
    data: OrgNodeData;
}

function OrgNodeComponent({ data }: OrgNodeProps) {
    const { position, employee, isManager, isCoPresident, locale, onEmptyClick, onEmployeeClick } = data;

    const levelLabels: Record<string, Record<string, string>> = {
        MANAGER: { fr: "Dirigeant", en: "Manager" },
        N: { fr: "Co-Président", en: "Co-President" },
        "N-1": { fr: "Directeur", en: "Director" },
        "N-2": { fr: "Collaborateur", en: "Employee" },
    };

    const levelColors: Record<string, string> = {
        MANAGER: "from-amber-500 to-orange-600",
        N: "from-purple-500 to-indigo-600",
        "N-1": "from-blue-500 to-cyan-600",
        "N-2": "from-slate-400 to-slate-600",
    };

    const levelBorderColors: Record<string, string> = {
        MANAGER: "border-amber-400",
        N: "border-purple-400",
        "N-1": "border-blue-400",
        "N-2": "border-slate-400",
    };

    const isEmpty = !employee;

    return (
        <div
            className={cn(
                "w-[160px] rounded-xl border-2 bg-card shadow-lg transition-all duration-200 nodrag pointer-events-auto",
                isEmpty ? "hover:border-primary hover:shadow-xl cursor-pointer" : "hover:shadow-xl cursor-pointer",
                levelBorderColors[position.level] || "border-border"
            )}
            onClick={isEmpty ? onEmptyClick : onEmployeeClick}
        >
            {/* Handle for incoming connections */}
            {
                position.level !== "MANAGER" && position.level !== "N" && (
                    <Handle type="target" position={Position.Top} className="opacity-0" />
                )
            }

            {/* Level badge */}
            <div className={cn(
                "absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-semibold text-white bg-gradient-to-r",
                levelColors[position.level]
            )}>
                {levelLabels[position.level]?.[locale as "fr" | "en"] || position.level}
            </div>

            <div className="p-4 pt-6 flex flex-col items-center gap-3">
                {isEmpty ? (
                    // Empty position placeholder
                    <>
                        <div className="w-20 h-20 rounded-full bg-muted border-2 border-dashed border-muted-foreground/30 flex items-center justify-center">
                            <Plus className="w-8 h-8 text-muted-foreground/50" />
                        </div>
                        <div className="text-center">
                            <p className="text-sm text-muted-foreground">
                                {locale === "fr" ? "Poste vacant" : "Vacant position"}
                            </p>
                        </div>
                    </>
                ) : (
                    // Filled position with employee
                    <>
                        <div className={cn(
                            "w-20 h-20 rounded-full overflow-hidden border-2 flex items-center justify-center",
                            levelBorderColors[position.level],
                            "bg-gradient-to-br from-muted to-muted/50"
                        )}>
                            {employee.portrait_uri ? (
                                <Image
                                    src={employee.portrait_uri}
                                    alt={`${employee.first_name} ${employee.last_name}`}
                                    width={80}
                                    height={80}
                                    className="object-cover w-full h-full"
                                />
                            ) : (
                                <div className="flex items-center justify-center w-full h-full">
                                    {isManager ? (
                                        <Crown className="w-8 h-8 text-amber-500" />
                                    ) : isCoPresident ? (
                                        <Briefcase className="w-8 h-8 text-purple-500" />
                                    ) : (
                                        <User className="w-8 h-8 text-muted-foreground" />
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="text-center min-w-0 w-full">
                            <p className="font-semibold text-sm truncate">
                                {employee.first_name} {employee.last_name}
                            </p>
                            {employee.role && (
                                <p className="text-xs text-muted-foreground truncate">
                                    {employee.role[locale as string] || employee.role.fr || Object.values(employee.role)[0]}
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Handle for outgoing connections */}
            {
                (position.level === "N" || position.level === "N-1") && (
                    <Handle type="source" position={Position.Bottom} className="opacity-0" />
                )
            }
        </div >
    );
}

export const OrgNode = memo(OrgNodeComponent);
