import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getMessage } from "../../../../lib/greenapi";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const ghlMsgId = searchParams.get("ghlMsgId");

        if (!ghlMsgId) {
            return NextResponse.json(
                { success: false, error: "ghlMsgId query parameter is required" },
                { status: 400, headers: corsHeaders }
            );
        }

        const map = await prisma.whatsappMessageMap.findFirst({
            where: { ghlMsgId },
        });

        if (!map) {
            return NextResponse.json(
                { success: false, error: "Message mapping not found", isReply: false },
                { status: 404, headers: corsHeaders }
            );
        }

        const isForwarded = map.isForwarded === true;
        const isForwardedOut = (map as any).isOutboundForward === true;
        const forwardedToName = (map as any).forwardedToName;

        const stanzaId = (map.stanzaId || "").trim();
        const replyToGhlMsgId = (map as any).replyToGhlMsgId;
        const quotedTextPreview = (map as any).quotedTextPreview;

        let quotedAttachments: string[] | null = null;

        if (isForwardedOut) {
            return NextResponse.json(
                { success: true, isReply: false, quotedText: null, isForwarded: false, isForwardedOut: true, forwardedToName: forwardedToName || null },
                { headers: corsHeaders }
            );
        }

        if (!stanzaId) {
            if (replyToGhlMsgId) {
                try {
                    const quotedMap = await prisma.whatsappMessageMap.findFirst({
                        where: {
                            ghlMsgId: replyToGhlMsgId,
                            locationId: map.locationId,
                        } as any,
                    });
                    const rawAtt = (quotedMap as any)?.attachments;
                    if (Array.isArray(rawAtt)) {
                        quotedAttachments = rawAtt.filter((u: any) => typeof u === "string") as string[];
                    }
                } catch (e) {
                    // non-fatal
                }
                return NextResponse.json(
                    {
                        success: true,
                        isReply: true,
                        quotedText: quotedTextPreview || "...",
                        quotedAttachments: quotedAttachments && quotedAttachments.length ? quotedAttachments : [],
                        isForwarded,
                    },
                    { headers: corsHeaders }
                );
            }
            return NextResponse.json(
                { success: true, isReply: false, quotedText: null, quotedAttachments: [], isForwarded },
                { headers: corsHeaders }
            );
        }

        const instance = await prisma.whatsappInstance.findFirst({
            where: { locationId: map.locationId },
            orderBy: { createdAt: "desc" },
        });

        if (!instance?.apiUrl || !instance?.idInstance || !instance?.apiTokenInstance) {
            return NextResponse.json(
                { success: true, isReply: true, quotedText: null, isForwarded, error: "Instance not found" },
                { headers: corsHeaders }
            );
        }

        const chatId = map.fromChatId?.includes("@") ? map.fromChatId : `${map.fromChatId || map.toChatId}@c.us`;
        const quoted = await getMessage(
            instance.apiUrl,
            instance.idInstance.toString(),
            instance.apiTokenInstance,
            chatId,
            stanzaId
        );

        let quotedText: string | null = null;
        if (quoted) {
            quotedText =
                quoted.textMessage ||
                quoted.extendedTextMessage?.text ||
                quoted.quotedMessage?.text ||
                null;
        }

        return NextResponse.json(
            { success: true, isReply: true, quotedText, quotedAttachments: [], isForwarded, isForwardedOut: false },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error("Error fetching quoted message:", error);
        return NextResponse.json(
            { success: false, error: error.message || "Internal error", isReply: false },
            { status: 500, headers: corsHeaders }
        );
    }
}
