import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

const trigger_keys = {
    "message_received_kleegr_whatsapp": "message_received_kleegr_whatsapp",
};

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        console.log("Received Trigger Event:", JSON.stringify(body, null, 2));

        const { triggerData, meta, extras } = body;

        if (!triggerData || !meta || !extras) {
            return NextResponse.json({ message: "Invalid payload" }, { status: 400 });
        }

        const { id: ghlId, eventType, targetUrl, filters } = triggerData;
        const { locationId } = extras;
        const ghlEventKey = meta.key;

        const aimfoxEvent = trigger_keys[ghlEventKey as keyof typeof trigger_keys];
        if (!aimfoxEvent) {
            console.log(`No mapping found for GHL event key: ${ghlEventKey}`);
            return NextResponse.json({ message: "Event key not mapped, ignoring" }, { status: 200 });
        }

        if (eventType === "CREATED" || eventType === "UPDATED") {
            await prisma.trigger.upsert({
                where: { ghlId: ghlId },
                update: { locationId, key: ghlEventKey, filters: filters || [], targetUrl, eventType },
                create: { ghlId, locationId, key: ghlEventKey, filters: filters || [], targetUrl, eventType }
            });
            console.log(`Trigger ${eventType}: ${ghlId}`);
            return NextResponse.json({ message: "Trigger saved successfully" });
        } else if (eventType === "DELETED") {
            try {
                await prisma.trigger.update({
                    where: { ghlId: ghlId },
                    data: { eventType: "DELETED" }
                });
                console.log(`Trigger DELETED: ${ghlId}`);
            } catch (e) {
                console.log(`Trigger to delete not found: ${ghlId}`);
            }
            return NextResponse.json({ message: "Trigger marked as deleted" });
        }

        return NextResponse.json({ message: "Event type ignored" });
    } catch (error: any) {
        console.error("Trigger Handler Error:", error);
        return NextResponse.json({ message: "Internal Server Error", error: error.message }, { status: 500 });
    }
}
