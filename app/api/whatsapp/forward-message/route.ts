import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { connection } from '../../../../lib/queue';
import { forwardMessages } from '../../../../lib/greenapi';
import { getToken } from '../../../../lib/token';
import {
    searchContactByPhone,
    searchConversation,
    createConversation,
    sentOutboundMessage,
} from '../../../../lib/ghl';

const APP_ID = process.env.GHL_APP_ID!;

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function phoneFromChatId(chatId: string): string {
    const raw = (chatId || '').replace(/@c\.us$/, '').replace(/@g\.us$/, '').trim();
    return raw.startsWith('+') ? raw : raw ? `+${raw}` : '';
}

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    console.log("forward-message route");
    try {
        const body = await request.json();
        const { locationId, fromChatId, toChatId, wpMsgId, messagePreview, toContactName, attachments } = body || {};

        if (!locationId || !fromChatId || !toChatId || !wpMsgId) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'locationId, fromChatId, toChatId and wpMsgId are required',
                },
                { status: 400, headers: corsHeaders }
            );
        }

        const instance = await prisma.whatsappInstance.findFirst({
            where: { locationId },
            orderBy: { createdAt: 'desc' },
        });

        if (!instance) {
            return NextResponse.json(
                { success: false, error: 'No WhatsApp instance found for this location' },
                { status: 404, headers: corsHeaders }
            );
        }

        const { apiUrl, idInstance, apiTokenInstance } = instance;

        if (!apiUrl || !idInstance || !apiTokenInstance) {
            return NextResponse.json(
                { success: false, error: 'Instance configuration is invalid' },
                { status: 500, headers: corsHeaders }
            );
        }

        const data = await forwardMessages(
            apiUrl,
            idInstance,
            apiTokenInstance,
            fromChatId,
            toChatId,
            [wpMsgId]
        );

        try {
            const tokenRecord = await getToken(locationId, APP_ID);
            if (tokenRecord && !('success' in tokenRecord && !tokenRecord.success)) {
                const ghlAuth = {
                    locationId,
                    access_token: (tokenRecord as any).accessToken || '',
                };
                const phone = phoneFromChatId(fromChatId);
                const isGroup = String(fromChatId).endsWith('@g.us');
                if (phone && !isGroup) {
                    const searchResp = await searchContactByPhone(ghlAuth, { phone });
                    const contactId = (searchResp.data as { id?: string } | null)?.id;
                    if (contactId) {
                        const convResp = await searchConversation(ghlAuth, contactId);
                        let conversationId =
                            convResp.success && convResp.data?.length > 0
                                ? convResp.data[0].id
                                : null;
                        if (!conversationId) {
                            const createResp = await createConversation(ghlAuth, contactId);
                            conversationId =
                                createResp.success && createResp.data
                                    ? (createResp.data as { id?: string }).id ?? null
                                    : null;
                        }
                        if (conversationId) {
                            const name = (toContactName && String(toContactName).trim()) || 'contact';
                            const messageBody = (messagePreview && String(messagePreview).trim())
                                ? String(messagePreview).slice(0, 500)
                                : 'Forwarded message';

                            const echoKey = `ghl_added_by_us:${locationId}:${contactId}:${Buffer.from(String(messageBody).trim()).toString('base64')}`;
                            await connection.set(echoKey, '1', 'EX', 60);

                            const msgResp = await sentOutboundMessage(ghlAuth, {
                                contactId,
                                message: messageBody,
                                ...(attachments && attachments.length > 0 && { attachments }),
                                status: 'read',
                                conversationId,
                            });
                            const ghlMsgIdOut = msgResp.success && msgResp.data
                                ? (msgResp.data as any)?.messageId ?? (msgResp.data as any)?.id ?? (msgResp.data as any)?.message?.id ?? null
                                : null;
                            if (ghlMsgIdOut) {
                                try {
                                    await prisma.whatsappMessageMap.create({
                                        data: {
                                            wpMsgId: 'fwd-' + ghlMsgIdOut,
                                            ghlMsgId: ghlMsgIdOut,
                                            locationId,
                                            fromChatId,
                                            toChatId: toChatId || '',
                                            isOutboundForward: true,
                                            forwardedToName: name,
                                        } as any,
                                    });
                                } catch (_) {}
                            }
                        }
                    }
                }
            }
        } catch (ghlErr: any) {
            console.warn('[forward-message] GHL add message failed (WhatsApp forward succeeded):', ghlErr?.message ?? ghlErr);
        }

        return NextResponse.json(
            {
                success: true,
                message: 'Message forwarded successfully',
                data,
            },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('Error forwarding message:', error);
        return NextResponse.json(
            {
                success: false,
                error: 'Internal Server Error',
                details: error.message,
            },
            { status: 500, headers: corsHeaders }
        );
    }
}
