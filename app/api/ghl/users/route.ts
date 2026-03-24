import { NextResponse } from "next/server";
import { getToken } from "../../../../lib/token";
import axios from "axios";

export async function GET(
    req: Request
) {
    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get("locationId");

        if (!locationId) {
            return NextResponse.json(
                { error: "Missing locationId", success: false },
                { status: 400 }
            );
        }

        const token = await getToken(locationId);
        if (!token || !token.accessToken) {
            return NextResponse.json(
                { error: "Unauthorized / No Token found", success: false },
                { status: 401 }
            );
        }

        const response = await axios.get(
            `https://services.leadconnectorhq.com/users/?locationId=${locationId}`,
            {
                headers: {
                    Authorization: `Bearer ${token.accessToken}`,
                    Version: "2021-07-28",
                    Accept: "application/json",
                },
            }
        );

        return NextResponse.json({
            success: true,
            users: response.data.users
        });

    } catch (error: any) {
        console.error("Error fetching users:", error.response?.data || error.message);
        return NextResponse.json(
            { error: "Failed to fetch users", details: error.message, success: false },
            { status: 500 }
        );
    }
}
