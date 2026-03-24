
import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";
import { logoutInstance } from "../../../lib/greenapi";

export async function POST(req: Request) {
    const body = await req.json();
    const { idInstance } = body;

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

        const logoutResp = await logoutInstance(apiUrl, idInstance, apiTokenInstance);

        console.log("Logout response:", logoutResp);

        return NextResponse.json({ success: true, data: logoutResp });

    } catch (error: any) {
        console.error("Error logging out:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
