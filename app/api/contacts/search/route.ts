import { NextResponse } from 'next/server';
import { searchContacts } from '../../../../lib/ghl';
import { getToken } from '../../../../lib/token';

const GHL_ORIGIN = "https://app.gohighlevel.com";

const DEFAULT_APP_ID = process.env.GHL_APP_ID || "";

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin": GHL_ORIGIN,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
    };
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET(req: Request) {
    try {
        const { searchParams } = new URL(req.url);
        const locationId = searchParams.get('locationId');
        const query = searchParams.get('query') || undefined;
        const appId = searchParams.get('appId') || DEFAULT_APP_ID;

        const searchAfter = searchParams.getAll('searchAfter[]');
        const startAfterId = searchAfter.length > 0 ? searchAfter : undefined;

        if (!locationId) {
            return NextResponse.json({ error: 'Location ID is required' }, { status: 400, headers: corsHeaders() });
        }

        const tokenData = await getToken(locationId, appId);

        if (!tokenData || !tokenData.accessToken) {
            console.error("No token found for location:", locationId);
            return NextResponse.json({ error: 'Integration not found or token invalid' }, { status: 401, headers: corsHeaders() });
        }

        const ghlAuth = {
            access_token: tokenData.accessToken,
            locationId: locationId,
        };

        const result = await searchContacts(ghlAuth, query, startAfterId);

        return NextResponse.json(result, { headers: corsHeaders() });
    } catch (error: any) {
        console.error('Error searching contacts:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500, headers: corsHeaders() });
    }
}
