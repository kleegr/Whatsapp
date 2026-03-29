import { NextResponse } from "next/server";
import { getSyncProgressHash } from "../../../../../lib/syncProgress";

export const runtime = "nodejs";

function toProgressDto(raw: Record<string, string>) {
    return {
        status: (raw.status as "idle" | "syncing" | "done" | "error") || "idle",
        phase: raw.phase || "",
        totalContacts: parseInt(raw.totalContacts || "0", 10),
        processedContacts: parseInt(raw.processedContacts || "0", 10),
        totalHistoryJobs: parseInt(raw.totalHistoryJobs || "0", 10),
        completedHistoryJobs: parseInt(raw.completedHistoryJobs || "0", 10),
        startedAt: raw.startedAt ? parseInt(raw.startedAt, 10) : null,
        error: raw.error || "",
    };
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const idInstance = searchParams.get("idInstance");
        if (!idInstance) {
            return NextResponse.json(
                { success: false, error: "idInstance is required" },
                { status: 400 }
            );
        }
        const hash = await getSyncProgressHash(idInstance.toString());
        if (!hash || Object.keys(hash).length === 0) {
            return NextResponse.json({ success: true, data: null });
        }
        return NextResponse.json({ success: true, data: toProgressDto(hash) });
    } catch (e: any) {
        console.error("sync-contacts/status:", e);
        return NextResponse.json(
            { success: false, error: e?.message || "Failed to read sync status" },
            { status: 500 }
        );
    }
}
