import { NextResponse } from "next/server";
import axios from "axios";
import { getToken } from "../../../lib/token";
import { webhookQueue, syncQueue } from "../../../lib/queue";
import { prisma } from "../../../lib/prisma";

export async function POST(req: Request) {

    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get("locationId");
        const userId = searchParams.get("userId");


        if (!locationId || !userId) {
            return NextResponse.json(
                { error: "locationId and userId are required" },
                { status: 400 }
            );
        }

        const body = await req.json();
        console.log("GreenAPI Webhook Body:", JSON.stringify(body));

        if (
            body.typeWebhook !== "incomingMessageReceived" &&
            body.typeWebhook !== "outgoingMessageReceived" &&
            body.typeWebhook !== "outgoingAPIMessageReceived" &&
            body.typeWebhook !== "stateInstanceChanged" &&
            body.typeWebhook !== "outgoingMessageStatus"
        ) {
            return NextResponse.json({ message: "Event ignored" });
        }

        if (body.typeWebhook === "stateInstanceChanged") {
            const { stateInstance, idInstance } = body.instanceData;
            console.log(`Received stateInstanceChanged: ${stateInstance} for instance ${idInstance}`);

            if (stateInstance === "authorized") {
                await syncQueue.add("sync-contacts", {
                    idInstance: idInstance
                }, {
                    removeOnComplete: true,
                    removeOnFail: 1000
                });
                console.log(`Triggered contact sync for instance ${idInstance}`);
            }

            return NextResponse.json({ success: true });
        }

        if (body.typeWebhook === "outgoingMessageStatus") {
            if (!body.idMessage || !body.status) {
                return NextResponse.json({ message: "Invalid payload (missing idMessage or status)" });
            }
        } else {
            const { senderData, messageData } = body;
            if (!senderData || !messageData) {
                return NextResponse.json({ message: "Invalid payload" });
            }
        }

        // --- QUEUE IMPLEMENTATION ---

        try {
            await webhookQueue.add('process-webhook', {
                body,
                locationId,
                userId
            }, {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                },
                removeOnComplete: true,
                removeOnFail: 100
            });

            const logMsg = body.typeWebhook === "outgoingMessageStatus"
                ? `idMessage=${body.idMessage} status=${body.status}`
                : body.senderData?.chatId;
            console.log(`Queued webhook event for ${logMsg}`);

            return NextResponse.json({ success: true, message: "Event queued for processing" });

        } catch (error: any) {
            console.error("Queue Error:", error);
            return NextResponse.json(
                { error: "Failed to queue event", details: error.message },
                { status: 500 }
            );
        }

    } catch (error: any) {
        console.error("Webhook Error:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message },
            { status: 500 }
        );
    }
}
