import { NextResponse } from "next/server";
import axios from "axios";

export async function POST(req: Request) {
    try {
        const webhookToken = process.env.GREEN_API_WEBHOOK_TOKEN;

        if (!webhookToken) {
            throw new Error("GREEN_API_WEBHOOK_TOKEN is not defined in environment variables");
        }

        const url = `https://api.green-api.com/partner/createInstance/${webhookToken}`;

        let payload = {
            "webhookUrlToken": webhookToken,
            "outgoingWebhook": "yes",
            "outgoingMessageWebhook": "yes",
            "incomingWebhook": "yes",
            "deletedMessageWebhook": "yes",
            "editedMessageWebhook": "yes"
        };

        try {
            const body = await req.json();
            if (body && Object.keys(body).length > 0) {
                payload = { ...payload, ...body };
            }
        } catch (e) {
            // Ignore if no body or invalid json
        }

        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        return NextResponse.json(response.data);

    } catch (error: any) {
        console.error("Error creating instance:", error);
        return NextResponse.json(
            { error: "Failed to create instance", details: error.message, data: error.response?.data },
            { status: 500 }
        );
    }
}
