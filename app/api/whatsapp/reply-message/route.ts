import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { sendMessage, sendFileByUrl } from '../../../../lib/greenapi';
import { connection } from '../../../../lib/queue';
import { getToken } from '../../../../lib/token';
import {
    searchContactByPhone,
    upsertContact,
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

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { locationId, chatId, message, quotedMessageId, quotedTextPreview, attachments } = body || {};

        const hasText = message && String(message).trim();
        const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

        if (!locationId || !chatId || (!hasText && !hasAttachments)) {
            return NextResponse.json(
                {
                    success: false,
                    error: 'locationId, chatId and (message or attachments) are required',
                },
                { status: 400, headers: corsHeaders }
            );
        }

        const preview = (message || '').substring(0, 80);
        console.log(
            `[WHATSAPP-REPLY] request locationId=${locationId} chatId=${chatId} quotedMessageId=${quotedMessageId || 'none'} msg="${preview}"`
        );

        const dedupContent = hasText ? message : (attachments?.[0] || '');
        if (dedupContent) {
            const msgHash = Buffer.from(`${dedupContent}::${quotedMessageId || ''}`).toString('base64');
            const dedupKey = `dedup:reply:${locationId}:${chatId}:${msgHash}`;
            const isDuplicate = await connection.get(dedupKey);
            if (isDuplicate) {
                console.log(`[WHATSAPP-REPLY] SKIP duplicate reply for key=${dedupKey}`);
                return NextResponse.json(
                    {
                        success: true,
                        skipped: true,
                        reason: 'Duplicate reply (dedup key hit)',
                    },
                    { headers: corsHeaders }
                );
            }

            await connection.set(dedupKey, '1', 'EX', 60);
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

        let data: any = null;
        if (hasAttachments) {
            const fileUrl = attachments[0];
            const fileName = fileUrl.split('/').pop()?.split('?')[0] || 'file';
            const ext = fileName.includes('.') ? '' : (fileUrl.match(/\.(jpg|jpeg|png|gif|webp|pdf|doc)/i)?.[1] || '');
            const safeName = fileName.includes('.') ? fileName : `file${ext ? '.' + ext : ''}`;
            data = await sendFileByUrl(
                apiUrl,
                idInstance,
                apiTokenInstance,
                chatId,
                fileUrl,
                safeName,
                hasText ? String(message).trim() : undefined,
                quotedMessageId
            );
        } else {
            data = await sendMessage(
                apiUrl,
                idInstance,
                apiTokenInstance,
                chatId,
                String(message).trim(),
                quotedMessageId
            );
        }

        const wpMsgIdFromWa = (data as any)?.idMessage;

        if (wpMsgIdFromWa) {
            await connection.set(`reply_adding:${locationId}:${wpMsgIdFromWa}`, '1', 'EX', 60);
        }

        let ghlReplyMsgId: string | null = null;
        try {
            const quotedMap = quotedMessageId
                ? await prisma.whatsappMessageMap.findFirst({
                      where: { wpMsgId: quotedMessageId, locationId },
                  })
                : null;
            const replyMessageId = quotedMap?.ghlMsgId;

            if (replyMessageId && wpMsgIdFromWa) {
                let pendingRowId: number | null = null;
                try {
                    const created = await prisma.whatsappMessageMap.create({
                        data: {
                            wpMsgId: wpMsgIdFromWa,
                            ghlMsgId: 'PENDING',
                            locationId,
                            fromChatId: chatId,
                            toChatId: instance.apiUrl || '',
                            stanzaId: '',
                            ...(replyMessageId && { replyToGhlMsgId: replyMessageId }),
                            ...(quotedTextPreview && String(quotedTextPreview).trim() && { quotedTextPreview: String(quotedTextPreview).trim().slice(0, 500) }),
                        } as any,
                    });
                    pendingRowId = (created as { id: number }).id;
                    console.log(`[WHATSAPP-REPLY] Created PENDING map id=${pendingRowId} for wpMsgId=${wpMsgIdFromWa}`);
                } catch (earlyErr: any) {
                    if (earlyErr?.code !== 'P2002') console.warn('[WHATSAPP-REPLY] PENDING map create failed:', earlyErr?.message);
                }

                const tokenData = await getToken(locationId, APP_ID);
                if (tokenData?.accessToken) {
                    const ghlAuth = { access_token: tokenData.accessToken, locationId };
                    const isGroup = String(chatId).includes('@g.us');
                    const rawPhone = String(chatId).replace(/@c\.us$/, '').replace(/@g\.us$/, '');
                    let contactId: string | undefined;
                    if (!isGroup) {
                        const searchResp = await searchContactByPhone(ghlAuth, { phone: rawPhone });
                        contactId = (searchResp.data as { id?: string } | null)?.id;
                        if (!contactId) {
                            const displayPhone = rawPhone.startsWith('+') ? rawPhone : '+' + rawPhone;
                            const upsertResp = await upsertContact(ghlAuth, {
                                phone: rawPhone,
                                first_name: displayPhone,
                                last_name: '',
                            });
                            contactId = (upsertResp.data as { id?: string } | null)?.id;
                        }
                    }
                    if (contactId) {
                        const convResp = await searchConversation(ghlAuth, contactId);
                        let conversationId =
                            convResp.success && convResp.data?.length > 0 ? convResp.data[0].id : null;
                        if (!conversationId) {
                            const createResp = await createConversation(ghlAuth, contactId);
                            conversationId =
                                createResp.success && createResp.data
                                    ? (createResp.data as { id?: string }).id ?? null
                                    : null;
                        }

                        if (message) {
                            const echoKey = `ghl_added_by_us:${locationId}:${contactId}:${Buffer.from(String(message).trim()).toString('base64')}`;
                            await connection.set(echoKey, '1', 'EX', 60);
                        }

                        const msgResp = await sentOutboundMessage(ghlAuth, {
                            contactId,
                            message,
                            replyMessageId,
                            threadId: replyMessageId,
                            status: 'read',
                            ...(conversationId && { conversationId }),
                        });
                        if (msgResp.success && msgResp.data) {
                            const d = msgResp.data as any;
                            ghlReplyMsgId = d?.messageId ?? d?.id ?? d?.message?.id ?? null;
                        }
                        if (ghlReplyMsgId && pendingRowId != null) {
                            await prisma.whatsappMessageMap.update({
                                where: { id: pendingRowId },
                                data: { ghlMsgId: ghlReplyMsgId } as any,
                            });
                        }
                    }
                }
            }
        } catch (ghlErr: any) {
            console.warn('[WHATSAPP-REPLY] GHL sync error (WhatsApp send succeeded):', ghlErr?.message);
        }

        return NextResponse.json(
            {
                success: true,
                message: 'Message sent successfully',
                data: { ...(typeof data === 'object' ? data : {}), ghlReplyMsgId },
            },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('Error sending reply message:', error);
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
