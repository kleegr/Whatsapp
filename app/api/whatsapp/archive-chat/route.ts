
import { NextResponse } from "next/server";
import axios from "axios";
import { prisma } from "../../../../lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    const locationId = body?.locationId as string | undefined;
    const userId = body?.userId as string | undefined;
    const chatId = body?.chatId as string | undefined;

    if (!locationId) {
      return NextResponse.json(
        { success: false, error: "locationId is required" },
        { status: 400 }
      );
    }

    if (!chatId || typeof chatId !== "string" || !chatId.trim()) {
      return NextResponse.json(
        { success: false, error: "chatId is required" },
        { status: 400 }
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
        { status: 404 }
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
    return NextResponse.json({
      success: true,
      status: resp.status,
      data: resp.data ?? null,
      instance: { idInstance },
    });
  } catch (error: any) {
    console.error("Error archiving chat:", error?.message || error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to archive chat",
        details: error?.message,
        data: error?.response?.data,
        status: error?.response?.status,
      },
      { status: 500 }
    );
  }
}
