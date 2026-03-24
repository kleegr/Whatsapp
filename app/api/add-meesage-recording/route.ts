import { NextResponse } from "next/server";
import { getToken } from "../../../lib/token";
import { addInboundMessage, sentOutboundMessage } from "../../../lib/ghl";

const APP_ID = process.env.GHL_APP_ID!;

// CORS headers helper
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// Handle OPTIONS request for CORS preflight
export async function OPTIONS(req: Request) {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId");

    if (!locationId) {
      return NextResponse.json(
        { error: "locationId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get data from request body
    const body = await req.json();
    const { contactId, attachments } = body;

    if (!contactId) {
      return NextResponse.json(
        { error: "contactId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Get GHL token
    const tokenRecord = await getToken(locationId, APP_ID);

    if (!tokenRecord || !('accessToken' in tokenRecord) || !tokenRecord.accessToken) {
      return NextResponse.json(
        { error: "Failed to get GHL access token" },
        { status: 401, headers: corsHeaders }
      );
    }

    const ghlAuth = {
      locationId,
      access_token: tokenRecord.accessToken,
      userId: tokenRecord.userId,
    };

    // Prepare message data
    const messageData: any = {
      contactId,
      ...(attachments && { attachments }),
    };

    // Add message to conversation
    const response = await sentOutboundMessage(ghlAuth, messageData);

    if (!response.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to add message to conversation",
          data: response.data,
        },
        { status: response.status || 500, headers: corsHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: response.data,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Add message error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process request",
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
