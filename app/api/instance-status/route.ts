import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";
import { getInstanceStatus } from "../../../lib/greenapi";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const idInstance = searchParams.get("idInstance");

    if (!idInstance) {
        return NextResponse.json({ success: false, error: "idInstance is required" }, { status: 400 });
    }

    try {
        const instance = await prisma.whatsappInstance.findUnique({
            where: { idInstance },
        });

        if (!instance) {
            return NextResponse.json({ success: false, error: "Instance not found" }, { status: 404 });
        }

        const { apiUrl, apiTokenInstance } = instance;
        const statusData = await getInstanceStatus(apiUrl, idInstance, apiTokenInstance);

        return NextResponse.json({ success: true, data: statusData });

    } catch (error: any) {
        console.error("Error fetching instance status:", error.message);
        return NextResponse.json({ success: false, error: "Failed to fetch instance status" }, { status: 500 });
    }
}
