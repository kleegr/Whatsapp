import { NextResponse } from "next/server";
import { getToken } from "../../../lib/token";
import { uploadFileToMediaLibrary } from "../../../lib/ghl";

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

    // Parse multipart form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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
    };

    // Upload to GHL Media Library
    console.log("Uploading file to GHL Media Library...");
    const uploadResp = await uploadFileToMediaLibrary(
      ghlAuth,
      "",
      buffer,
      "audio.mp3",
      "audio/mpeg"
    );

    console.log("Upload Response:", uploadResp);

    if (uploadResp?.success && uploadResp?.data?.file?.url) {
      return NextResponse.json(
        {
          success: true,
          url: uploadResp.data.file.url,
          data: uploadResp.data,
        },
        { headers: corsHeaders }
      );
    } else if (uploadResp?.success && uploadResp?.data?.url) {
      return NextResponse.json(
        {
          success: true,
          url: uploadResp.data.url,
          data: uploadResp.data,
        },
        { headers: corsHeaders }
      );
    }

    return NextResponse.json(
      { success: false, error: "Upload failed or returned no URL", data: uploadResp },
      { status: 500, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
