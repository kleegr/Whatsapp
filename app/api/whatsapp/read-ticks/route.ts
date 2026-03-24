import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const READ_TICKS_WINDOW_MS = 120_000; // 2 min

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const locationId = searchParams.get("locationId");

        if (!locationId) {
            return NextResponse.json(
                { success: false, error: "locationId query parameter is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        const since = new Date(Date.now() - READ_TICKS_WINDOW_MS);
        const rows = await prisma.whatsappMessageMap.findMany({
            where: {
                locationId,
                readAt: { not: null, gte: since },
                ghlMsgId: { not: 'PENDING' },
            } as any,
            select: { id: true, ghlMsgId: true },
        });

        const ghlMsgIds = rows.map((r) => r.ghlMsgId).filter((id): id is string => Boolean(id) && id !== 'PENDING');
        if (rows.length > 0) {
            await prisma.whatsappMessageMap.updateMany({
                where: { id: { in: rows.map((r) => r.id) } },
                data: { readAt: null } as any,
            });
        }

        return NextResponse.json(
            { success: true, ghlMsgIds },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error("read-ticks error:", error?.message ?? error);
        return NextResponse.json(
            { success: false, error: error?.message ?? "Internal error", ghlMsgIds: [] },
            { status: 500, headers: corsHeaders }
        );
    }
}
