import { getToken } from "../../../lib/token";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");
    const appId = searchParams.get("appId") || process.env.GHL_APP_ID;

    if (!locationId || !appId) {
        return NextResponse.json({ error: "Missing locationId or appId" }, { status: 400 });
    }

    const token = await getToken(locationId, appId);
    return NextResponse.json(token);
}
