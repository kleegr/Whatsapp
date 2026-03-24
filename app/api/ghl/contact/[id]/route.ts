import { NextResponse } from "next/server";
import { getToken } from "../../../../../lib/token";
import { getContactById } from "../../../../../lib/ghl";
import axios from "axios";

const GHL_BASE = "https://services.leadconnectorhq.com";

export async function GET(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params; // contactId
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get("locationId");

        if (!locationId) {
            return NextResponse.json(
                { error: "Missing locationId", success: false },
                { status: 400 }
            );
        }

        const token = await getToken(locationId);

        if (!token || !('accessToken' in token) || !token.accessToken) {
            return NextResponse.json(
                { error: "Unauthorized / No Token found", success: false },
                { status: 401 }
            );
        }

        const ghlAuth = {
            access_token: token.accessToken,
            locationId: locationId,
        };

        const result = await getContactById(ghlAuth, id);

        if (!result.success) {
            return NextResponse.json(
                { error: result.data || "Failed to fetch contact", success: false },
                { status: result.status || 500 }
            );
        }

        return NextResponse.json({
            success: true,
            contact: result.data
        });

    } catch (error: any) {
        console.error("Error fetching contact:", error);
        return NextResponse.json(
            { error: "Failed to fetch contact", details: error.message, success: false },
            { status: 500 }
        );
    }
}

export async function PUT(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params; // contactId
        const body = await req.json();
        const { locationId, customField, firstName, lastName, email, phone } = body;

        if (!locationId) {
            return NextResponse.json({ error: "Missing locationId", success: false }, { status: 400 });
        }

        const token = await getToken(locationId);
        if (!token || !('accessToken' in token) || !token.accessToken) {
            return NextResponse.json({ error: "Unauthorized", success: false }, { status: 401 });
        }

        // Build GHL update payload
        const updatePayload: Record<string, any> = {};
        if (firstName !== undefined) updatePayload.firstName = firstName;
        if (lastName !== undefined) updatePayload.lastName = lastName;
        if (email !== undefined) updatePayload.email = email;
        if (phone !== undefined) updatePayload.phone = phone;

        if (customField && customField.length > 0) {
            updatePayload.customFields = customField
                .filter((cf: any) => cf.value !== undefined && cf.value !== null && cf.value !== '')
                .map((cf: any) => ({ id: cf.id, value: String(cf.value) }));
        }

        console.log("updatedPayload", updatePayload);

        const res = await axios.put(
            `${GHL_BASE}/contacts/${id}`,
            updatePayload,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${token.accessToken}`,
                },
            }
        );

        return NextResponse.json({ success: true, contact: res.data?.contact || res.data });
    } catch (error: any) {
        console.error("Error updating contact:", error?.response?.data || error.message);
        return NextResponse.json(
            { error: error?.response?.data?.message || error.message, success: false },
            { status: error?.response?.status || 500 }
        );
    }
}
