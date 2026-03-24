import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";
import axios from "axios";

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
        const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
        const qrUrl = `${baseUrl}waInstance${idInstance}/qr/${apiTokenInstance}`;

        const response = await axios.get(qrUrl);

        if (response.data && response.data.type === "qrCode" && response.data.message) {
            const base64Image = `data:image/png;base64,${response.data.message}`;
            return NextResponse.json({ success: true, url: base64Image });
        } else {
            console.error("Unexpected QR response format:", response.data);
            return NextResponse.json({ success: false, error: "Invalid QR code response from provider" }, { status: 502 });
        }

    } catch (error: any) {
        console.error("Error fetching QR code:", error.message);
        return NextResponse.json({ success: false, error: "Failed to fetch QR code" }, { status: 500 });
    }
}
