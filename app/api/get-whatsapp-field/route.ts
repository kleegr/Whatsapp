import { prisma } from "../../../lib/prisma";
import { getToken } from "../../../lib/token";
import { getCustomFieldValue, GHLAuth } from "../../../lib/ghl";
import { NextResponse } from "next/server";

const APP_ID = process.env.GHL_APP_ID!;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");
    const contactId = searchParams.get("contactId");

    if (!locationId) {
        return NextResponse.json({ error: "Missing locationId" }, { status: 400 });
    }

    if (!contactId) {
        return NextResponse.json({ error: "Missing contactId" }, { status: 400 });
    }

    try {
        const tokenRecord = await getToken(locationId, APP_ID);

        if (!tokenRecord || !("accessToken" in tokenRecord)) {
            return NextResponse.json(
                { error: "Token not found or invalid for this location" },
                { status: 404 }
            );
        }

        const ghl: GHLAuth = {
            access_token: tokenRecord?.accessToken,
            locationId: locationId,
            userId: tokenRecord?.userId,
        };
        console.log("ghl", ghl)
        console.log("contactId", contactId)
        const whatsappValue = await getCustomFieldValue(ghl, contactId, "Group ID");
        console.log("whatsappValue", whatsappValue)
        return NextResponse.json({
            success: true,
            locationId,
            contactId,
            whatsappValue,
        });
    } catch (error: any) {
        console.error("Error fetching WhatsApp field:", error);
        return NextResponse.json(
            { error: error.message || "Failed to fetch WhatsApp field value" },
            { status: 500 }
        );
    }
}
