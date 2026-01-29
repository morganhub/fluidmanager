"use client";

import { useAppStore, type DrawerContent } from "@/lib/store";
import { createTranslator } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { X } from "lucide-react";

export function ContextDrawer() {
    const t = createTranslator("fr");
    const { drawerOpen, drawerContent, closeDrawer } = useAppStore();

    if (!drawerOpen || !drawerContent) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
                onClick={closeDrawer}
            />

            {/* Drawer */}
            <div
                className={cn(
                    "fixed right-0 top-0 z-50 h-screen w-[480px] border-l border-border bg-card shadow-xl",
                    "animate-slide-in-right"
                )}
            >
                {/* Header */}
                <div className="flex h-16 items-center justify-between px-6 border-b border-border">
                    <h2 className="text-lg font-semibold">
                        {getDrawerTitle(drawerContent, t)}
                    </h2>
                    <Button variant="ghost" size="icon" onClick={closeDrawer}>
                        <X size={18} />
                    </Button>
                </div>

                {/* Content */}
                <ScrollArea className="h-[calc(100vh-4rem)]">
                    <div className="p-6">
                        <DrawerContentRenderer content={drawerContent} />
                    </div>
                </ScrollArea>
            </div>
        </>
    );
}

function getDrawerTitle(content: DrawerContent, t: (key: string) => string): string {
    switch (content.type) {
        case "task":
            return t("nav.tasks");
        case "employee":
            return t("nav.employees");
        case "integration":
            return t("nav.integrations");
        case "meeting":
            return t("nav.meetings");
        case "create-task":
            return t("task.createNew");
        case "create-employee":
            return t("employee.createNew");
        case "create-integration":
            return t("integration.createNew");
        case "create-meeting":
            return t("meeting.createNew");
        default:
            return "";
    }
}

function DrawerContentRenderer({ content }: { content: DrawerContent }) {
    // This will be expanded with actual content components
    switch (content.type) {
        case "task":
            return <TaskDetailPlaceholder taskId={content.taskId} />;
        case "employee":
            return <EmployeeDetailPlaceholder employeeId={content.employeeId} />;
        case "integration":
            return <IntegrationDetailPlaceholder integrationId={content.integrationId} />;
        case "meeting":
            return <MeetingDetailPlaceholder meetingId={content.meetingId} />;
        case "create-task":
            return <CreateTaskPlaceholder projectId={content.projectId} />;
        case "create-employee":
            return <CreateEmployeePlaceholder />;
        case "create-integration":
            return <CreateIntegrationPlaceholder />;
        case "create-meeting":
            return <CreateMeetingPlaceholder projectId={content.projectId} />;
        default:
            return null;
    }
}

// Placeholder components - will be replaced with actual implementations
function TaskDetailPlaceholder({ taskId }: { taskId: string }) {
    return (
        <div className="space-y-4">
            <p className="text-muted-foreground">Task ID: {taskId}</p>
            <p className="text-sm text-muted-foreground">Task detail component coming soon...</p>
        </div>
    );
}

function EmployeeDetailPlaceholder({ employeeId }: { employeeId: string }) {
    return (
        <div className="space-y-4">
            <p className="text-muted-foreground">Employee ID: {employeeId}</p>
            <p className="text-sm text-muted-foreground">Employee detail component coming soon...</p>
        </div>
    );
}

function IntegrationDetailPlaceholder({ integrationId }: { integrationId: string }) {
    return (
        <div className="space-y-4">
            <p className="text-muted-foreground">Integration ID: {integrationId}</p>
            <p className="text-sm text-muted-foreground">Integration detail component coming soon...</p>
        </div>
    );
}

function MeetingDetailPlaceholder({ meetingId }: { meetingId: string }) {
    return (
        <div className="space-y-4">
            <p className="text-muted-foreground">Meeting ID: {meetingId}</p>
            <p className="text-sm text-muted-foreground">Meeting detail component coming soon...</p>
        </div>
    );
}

function CreateTaskPlaceholder({ projectId }: { projectId?: string }) {
    return (
        <div className="space-y-4">
            {projectId && <p className="text-muted-foreground">Project ID: {projectId}</p>}
            <p className="text-sm text-muted-foreground">Create task form coming soon...</p>
        </div>
    );
}

function CreateEmployeePlaceholder() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Create employee form coming soon...</p>
        </div>
    );
}

function CreateIntegrationPlaceholder() {
    return (
        <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Create integration form coming soon...</p>
        </div>
    );
}

function CreateMeetingPlaceholder({ projectId }: { projectId?: string }) {
    return (
        <div className="space-y-4">
            {projectId && <p className="text-muted-foreground">Project ID: {projectId}</p>}
            <p className="text-sm text-muted-foreground">Create meeting form coming soon...</p>
        </div>
    );
}
