
import { NextResponse } from "next/server";
import { getToken } from "../../../lib/token";
import { getUserInfo } from "../../../lib/ghl";

export async function GET(req: Request) {
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

        // Get Access Token
        const tokenData = await getToken(locationId);
        if (!tokenData || !('accessToken' in tokenData) || !tokenData.accessToken) {
            return NextResponse.json(
                { error: "No access token found for this location" },
                { status: 401 }
            );
        }

        // Fetch user info from GHL
        const userRes = await getUserInfo(tokenData.accessToken, userId);

        if (userRes.success) {
            return NextResponse.json({
                success: true,
                data: userRes.data
            });
        } else {
            return NextResponse.json(
                { error: "Failed to fetch user info", details: userRes.data },
                { status: userRes.status || 500 }
            );
        }
    } catch (error: any) {
        console.error("Error in user API:", error);
        return NextResponse.json(
            { error: "Internal Server Error", details: error.message },
            { status: 500 }
        );
    }
}
