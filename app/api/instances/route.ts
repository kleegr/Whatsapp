import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";
import { createGreenApiInstance, deleteGreenApiInstance } from "../../../lib/greenapi";
import { getSubaccount, getSubaccountUser } from "../../../lib/ghl";

const APP_ID = process.env.GHL_APP_ID!;

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");

    if (!locationId) {
        return NextResponse.json({ success: false, error: "locationId is required" }, { status: 400 });
    }

    try {
        const instances = await prisma.whatsappInstance.findMany({
            where: { locationId },
        });

        return NextResponse.json({ success: true, count: instances.length, data: instances });
    } catch (error: any) {
        console.error("Error fetching instances:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}


export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { locationId, companyId, userId, name } = body;

        if (!locationId || !userId) {
            return NextResponse.json({ success: false, error: "locationId and userId are required" }, { status: 400 });
        }


        let instanceName = "";

        const tokenData = await prisma.token.findUnique({
            where: { locationId_appId: { locationId, appId: APP_ID } }
        });

        if (tokenData && 'accessToken' in tokenData && tokenData.accessToken) {
            try {
                const subRes = await getSubaccountUser(tokenData.accessToken, userId);
                if (subRes.success && subRes.data && typeof subRes.data !== 'string') {
                    instanceName = subRes.data.name || `${subRes.data.firstName} ${subRes.data.lastName}`;
                }
            } catch (err) {
                console.error("Failed to fetch user name, using default.", err);
            }
        }

        const webhookToken = process.env.GREEN_API_WEBHOOK_TOKEN;
        if (!webhookToken) {
            throw new Error("GREEN_API_WEBHOOK_TOKEN is not configured");
        }

        const randomStr = Math.random().toString(36).substring(7);
        const webhookUrl = `https://whatsapp.kleegr.com/api/greenapi-webhook?locationId=${locationId}&userId=${userId}&r=${randomStr}`;

        const payload = {
            name: `${instanceName} connection`,
            webhookUrl: webhookUrl,
            webhookUrlToken: webhookToken,
            outgoingWebhook: "yes",
            outgoingMessageWebhook: "yes",
            incomingWebhook: "yes",
            deletedMessageWebhook: "yes",
            editedMessageWebhook: "yes",
            stateWebhook: "yes",
            outgoingAPIMessageWebhook: "yes",
        };

        const instanceResp = await createGreenApiInstance(webhookToken, payload);

        if (!instanceResp || !instanceResp.idInstance || !instanceResp.apiTokenInstance) {
            throw new Error("Failed to create GreenAPI instance");
        }

        const newInstance = await prisma.whatsappInstance.create({
            data: {
                locationId,
                userId,
                companyId,
                idInstance: instanceResp.idInstance.toString(),
                apiTokenInstance: instanceResp.apiTokenInstance,
                apiUrl: instanceResp.apiUrl,
                mediaUrl: instanceResp.mediaUrl || "",
                typeInstance: instanceResp.typeInstance || "whatsapp",
                name: instanceName,
            },
        });

        return NextResponse.json({ success: true, data: newInstance });

    } catch (error: any) {
        console.error("Error creating instance:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
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

        const webhookToken = process.env.GREEN_API_WEBHOOK_TOKEN;
        if (webhookToken) {
            try {
                await deleteGreenApiInstance(webhookToken, idInstance);
            } catch (apiError) {
                console.error("Warning: Failed to delete from GreenAPI, proceeding to DB delete.", apiError);
            }
        }

        await prisma.whatsappInstance.delete({
            where: { idInstance },
        });

        return NextResponse.json({ success: true, message: "Instance deleted successfully" });

    } catch (error: any) {
        console.error("Error deleting instance:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
