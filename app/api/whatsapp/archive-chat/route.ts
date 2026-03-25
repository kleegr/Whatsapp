import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "../../../../lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const locationId = body?.locationId as string | undefined;
    const userId = body?.userId as string | undefined;
    const chatId = body?.chatId as string | undefined;

    if (!locationId) {
      return NextResponse.json(
        { success: false, error: "locationId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    if (!chatId || typeof chatId !== "string" || !chatId.trim()) {
      return NextResponse.json(
        { success: false, error: "chatId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Prefer user-specific instance; fallback to location instance (matches outbound worker behavior)
    let instance =
      (userId
        ? await prisma.whatsappInstance.findFirst({
            where: { locationId, userId },
            orderBy: { createdAt: "desc" },
          })
        : null) ||
      (await prisma.whatsappInstance.findFirst({
        where: { locationId },
        orderBy: { createdAt: "desc" },
      }));

    if (!instance) {
      return NextResponse.json(
        { success: false, error: "WhatsApp instance not found for locationId" },
        { status: 404, headers: corsHeaders }
      );
    }

    const { apiUrl, idInstance, apiTokenInstance } = instance;
    const baseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;

    // Green-API docs: POST {{apiUrl}}/waInstance{{idInstance}}/archiveChat/{{apiTokenInstance}}
    // Body: { chatId }
    const url = `${baseUrl}waInstance${idInstance}/archiveChat/${apiTokenInstance}`;

    const resp = await axios.post(
      url,
      { chatId: chatId.trim() },
      { headers: { "Content-Type": "application/json" } }
    );

    // archiveChat returns empty body on success (200)
    return NextResponse.json(
      {
        success: true,
        status: resp.status,
        data: resp.data ?? null,
        instance: { idInstance },
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Error archiving chat:", error?.message || error);
    const axiosStatus = error?.response?.status;
    const status =
      typeof axiosStatus === "number" && axiosStatus >= 400 && axiosStatus < 600
        ? axiosStatus
        : 500;
    return NextResponse.json(
      {
        success: false,
        error: "Failed to archive chat",
        details: error?.message,
        data: error?.response?.data,
        status: axiosStatus,
      },
      { status, headers: corsHeaders }
    );
  }
}
