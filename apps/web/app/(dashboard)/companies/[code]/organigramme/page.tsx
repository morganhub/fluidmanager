"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    useNodesState,
    useEdgesState,
    Node,
    Edge,
    ConnectionMode,
    MarkerType,
    NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createTranslator } from "@/lib/i18n";
import { useAppStore } from "@/lib/store";
import { apiGet, apiPost } from "@/lib/api";
import { RotateCcw } from "lucide-react";
import { OrgNode } from "@/components/org-chart/OrgNode";
import { RecruitmentDrawer } from "@/components/org-chart/RecruitmentDrawer";
import { EmployeeEditDialog } from "@/components/org-chart/EmployeeEditDialog";

// API Types
interface OrgPosition {
    id: string;
    level: string;
    position_index: number;
    parent_position_id: string | null;
}

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

interface OrgChartData {
    company_id: string;
    positions: OrgPosition[];
    employees: Record<string, Employee>;
}

// Custom node types - eslint-disable for React Flow compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes: NodeTypes = {
    orgNode: OrgNode as any,
};

// Layout constants
const NODE_WIDTH = 180;
const NODE_HEIGHT = 220;
const HORIZONTAL_GAP = 40;
const VERTICAL_GAP = 80;

export default function OrganigrammePage() {
    const params = useParams();
    const companyCode = params.code as string;
    const t = createTranslator("fr");
    const { locale } = useAppStore();

    const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
    const [orgData, setOrgData] = useState<OrgChartData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Drawer state for recruitment
    const [selectedPosition, setSelectedPosition] = useState<OrgPosition | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // Dialog state for employee edit
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);

    // Fetch org chart data
    const fetchOrgChart = useCallback(async () => {
        try {
            setLoading(true);
            // First get company ID from code via admin API
            const companiesData = await apiGet<{ items: { id: string; code: string }[] }>(
                "/admin/companies",
                { search: companyCode }
            );
            const company = companiesData.items?.find((c) => c.code === companyCode);

            if (!company) {
                setError("Company not found");
                return;
            }

            const data = await apiGet<OrgChartData>(`/companies/${company.id}/org-chart`);
            setOrgData(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    }, [companyCode]);

    const handleConfirmRecruit = () => {
        setDrawerOpen(false); // Assuming setRecruitOpen is equivalent to setDrawerOpen for recruitment
        fetchOrgChart();
    };

    const handleReset = async () => {
        if (!orgData?.company_id) return;

        // Simple confirmation
        if (!window.confirm(t("common.confirm") + " ? " + t("common.reset"))) {
            return;
        }

        try {
            setLoading(true);
            await apiPost(`/companies/${orgData.company_id}/org-chart/reset`);
            fetchOrgChart();
        } catch (err) {
            console.error("Reset failed:", err);
        } finally {
            setLoading(false);
        }
    };

    // Node types definition
    const nodeTypes: NodeTypes = useMemo(() => ({
        orgNode: OrgNode as any,
    }), []);

    useEffect(() => {
        fetchOrgChart();
    }, [fetchOrgChart]);

    // Build nodes and edges from org data
    useEffect(() => {
        if (!orgData) return;

        const { positions, employees } = orgData;
        const newNodes: Node[] = [];
        const newEdges: Edge[] = [];

        // Group positions by level
        const managerPos = positions.find(p => p.level === "MANAGER");
        const nPos = positions.find(p => p.level === "N");
        const n1Positions = positions.filter(p => p.level === "N-1").sort((a, b) => a.position_index - b.position_index);
        const n2Positions = positions.filter(p => p.level === "N-2").sort((a, b) => a.position_index - b.position_index);

        // Row 1: Manager + N (side by side)
        const row1Width = 2 * NODE_WIDTH + HORIZONTAL_GAP;
        const row1StartX = -row1Width / 2 + NODE_WIDTH / 2;

        if (managerPos) {
            const emp = employees[managerPos.id];
            newNodes.push({
                id: managerPos.id,
                type: "orgNode",
                position: { x: row1StartX, y: 0 },
                data: {
                    position: managerPos,
                    employee: emp,
                    isManager: true,
                    locale,
                    onEmptyClick: () => handleEmptyClick(managerPos),
                    onEmployeeClick: () => emp && handleEmployeeClick(emp),
                },
            });
        }

        if (nPos) {
            const emp = employees[nPos.id];
            newNodes.push({
                id: nPos.id,
                type: "orgNode",
                position: { x: row1StartX + NODE_WIDTH + HORIZONTAL_GAP, y: 0 },
                data: {
                    position: nPos,
                    employee: emp,
                    isCoPresident: true,
                    locale,
                    onEmptyClick: () => handleEmptyClick(nPos),
                    onEmployeeClick: () => emp && handleEmployeeClick(emp),
                },
            });

            // Edge from N to each N-1
            n1Positions.forEach(n1 => {
                newEdges.push({
                    id: `${nPos.id}->${n1.id}`,
                    source: nPos.id,
                    target: n1.id,
                    type: "smoothstep",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: "#94a3b8", strokeWidth: 2 },
                });
            });
        }

        // Row 2: N-1 positions
        const row2Width = n1Positions.length * NODE_WIDTH + (n1Positions.length - 1) * HORIZONTAL_GAP;
        const row2StartX = -row2Width / 2 + NODE_WIDTH / 2;
        const row2Y = NODE_HEIGHT + VERTICAL_GAP;

        n1Positions.forEach((pos, idx) => {
            const emp = employees[pos.id];
            newNodes.push({
                id: pos.id,
                type: "orgNode",
                position: { x: row2StartX + idx * (NODE_WIDTH + HORIZONTAL_GAP), y: row2Y },
                data: {
                    position: pos,
                    employee: emp,
                    locale,
                    onEmptyClick: () => handleEmptyClick(pos),
                    onEmployeeClick: () => emp && handleEmployeeClick(emp),
                },
            });

            // Edges from N-1 to its N-2 children
            const children = n2Positions.filter(n2 => n2.parent_position_id === pos.id);
            children.forEach(n2 => {
                newEdges.push({
                    id: `${pos.id}->${n2.id}`,
                    source: pos.id,
                    target: n2.id,
                    type: "smoothstep",
                    markerEnd: { type: MarkerType.ArrowClosed },
                    style: { stroke: "#94a3b8", strokeWidth: 2 },
                });
            });
        });

        // Row 3: N-2 positions (grouped by parent N-1)
        const row3Y = row2Y + NODE_HEIGHT + VERTICAL_GAP;
        let n2Idx = 0;

        // Calculate total width for N-2 row
        const totalN2 = n2Positions.length;
        const row3Width = totalN2 * NODE_WIDTH + (totalN2 - 1) * HORIZONTAL_GAP;
        const row3StartX = -row3Width / 2 + NODE_WIDTH / 2;

        n2Positions.forEach((pos) => {
            const emp = employees[pos.id];
            newNodes.push({
                id: pos.id,
                type: "orgNode",
                position: { x: row3StartX + n2Idx * (NODE_WIDTH + HORIZONTAL_GAP), y: row3Y },
                data: {
                    position: pos,
                    employee: emp,
                    locale,
                    onEmptyClick: () => handleEmptyClick(pos),
                    onEmployeeClick: () => emp && handleEmployeeClick(emp),
                },
            });
            n2Idx++;
        });

        setNodes(newNodes);
        setEdges(newEdges);
    }, [orgData, locale, setNodes, setEdges]);

    const handleEmptyClick = (position: OrgPosition) => {
        setSelectedPosition(position);
        setDrawerOpen(true);
    };

    const handleEmployeeClick = (employee: Employee) => {
        setSelectedEmployee(employee);
        setEditDialogOpen(true);
    };

    const handleRecruitSuccess = () => {
        setDrawerOpen(false);
        setSelectedPosition(null);
        fetchOrgChart();
    };

    const handleEmployeeUpdate = () => {
        setEditDialogOpen(false);
        setSelectedEmployee(null);
        fetchOrgChart();
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[calc(100vh-120px)]">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
        return (
            <Card>
                <CardContent className="p-6">
                    <p className="text-destructive">{error}</p>
                    <Button onClick={fetchOrgChart} className="mt-4">
                        {t("common.retry") || "Réessayer"}
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="h-[calc(100vh-120px)] flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">{t("nav.organigramme")}</h1>
                <Button variant="outline" size="sm" onClick={handleReset} disabled={loading}>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    {t("common.reset")}
                </Button>
            </div>

            <div className="flex-1 border rounded-lg overflow-hidden bg-muted/20">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    connectionMode={ConnectionMode.Loose}
                    fitView
                    fitViewOptions={{ padding: 0.2, minZoom: 0.5, maxZoom: 1.5 }}
                    minZoom={0.3}
                    maxZoom={2}
                    nodesDraggable={false}
                    nodesConnectable={false}
                    elementsSelectable={false}
                    panOnScroll
                    zoomOnScroll
                >
                    <Background gap={20} size={1} />
                    <Controls
                        position="bottom-right"
                        showInteractive={false}
                    />
                    <MiniMap
                        position="bottom-left"
                        nodeStrokeWidth={3}
                        pannable
                        zoomable
                    />
                </ReactFlow>
            </div>

            {/* Recruitment Drawer */}
            <RecruitmentDrawer
                open={drawerOpen}
                onOpenChange={setDrawerOpen}
                position={selectedPosition}
                companyId={orgData?.company_id || ""}
                onSuccess={handleRecruitSuccess}
            />

            {/* Employee Edit Dialog */}
            <EmployeeEditDialog
                open={editDialogOpen}
                onOpenChange={setEditDialogOpen}
                employee={selectedEmployee}
                companyId={orgData?.company_id || ""}
                onSuccess={handleEmployeeUpdate}
            />
        </div>
    );
}
