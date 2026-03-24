import './env';
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { prisma } from './prisma';
import {
    upsertContact,
    searchContactByPhone,
    searchConversation,
    addMessageToConversation,
    createConversation,
    updateMessageStatus,
    uploadFileToMediaLibrary,
    sentOutboundMessage,
    setupCustomFields,
    updateContact,
    getCustomFieldValue,
    ContactData
} from './ghl';
import { getGroupData, getChatHistory, getContacts } from './greenapi';
import { getToken } from './token';
import axios from 'axios';

const APP_ID = process.env.GHL_APP_ID!;

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

// Higher concurrency = faster incoming message processing (more GHL API calls in parallel). Tune per plan limits.
const PROCESS_CONCURRENCY = parseInt(process.env.WEBHOOK_WORKER_CONCURRENCY || '5', 10) || 5;

/** Extract GHL message ID from API response (messageId, id, or message.id). */
function getGhlMessageIdFromResponse(data: any): string | null {
    if (!data || typeof data !== "object") return null;
    if (data.messageId && typeof data.messageId === "string") return data.messageId;
    if (data.id && typeof data.id === "string") return data.id;
    if (data.message?.id && typeof data.message.id === "string") return data.message.id;
    return null;
}

// Helper function to extract stanzaId from messageData
function extractStanzaId(messageData: any, body: any): string {
    // Check multiple possible locations for stanzaId
    if (messageData?.extendedTextMessageData?.stanzaId) {
        return messageData.extendedTextMessageData.stanzaId;
    }
    if (messageData?.quotedMessage?.stanzaId) {
        return messageData.quotedMessage.stanzaId;
    }
    if (messageData?.stanzaId) {
        return messageData.stanzaId;
    }
    if (body?.stanzaId) {
        return body.stanzaId;
    }
    // Return empty string instead of "no Id" to avoid potential database issues
    return "";
}

function matchFilter(filter: any, eventData: any): boolean {
    const field = filter.field;
    const operator = filter.operator;
    const value = filter.value;

    let actualValue = eventData[field];

    // Helper to standardise string for comparison
    const getString = (val: any) => {
        if (Array.isArray(val)) return val.join(" ");
        if (val === undefined || val === null) return "";
        return String(val);
    };

    const stringValue = getString(actualValue).toLowerCase();

    if (operator === 'has_value') {
        return stringValue.trim() !== "";
    }

    if (operator === 'string-contains-any-of' || operator === 'array-contains') {
        const targets = Array.isArray(value) ? value : [value];
        return targets.some((t: any) => {
            const target = String(t).toLowerCase();
            return stringValue.includes(target);
        });
    }

    if (operator === '==') {
        return stringValue === String(value).toLowerCase();
    }

    if (operator === '!=') {
        return stringValue !== String(value).toLowerCase();
    }

    return true;
}

const worker = new Worker('webhook-processing', async (job: Job) => {
    console.log(`Processing job ${job.id}: ${job.name}`);

    const { body, locationId, userId } = job.data;

    // Handle outgoingMessageStatus early (read/delivered ticks) - no senderData/messageData
    if (body.typeWebhook === "outgoingMessageStatus") {
        const idMessage = body.idMessage;
        const status = body.status;
        console.log(`[TICKS] outgoingMessageStatus idMessage=${idMessage} status=${status}`);
        if (status === "read" && idMessage) {
            const tokenRecord = await getToken(locationId, APP_ID);
            if (tokenRecord && !("success" in tokenRecord && !tokenRecord.success)) {
                const ghlAuth = {
                    locationId,
                    access_token: (tokenRecord as any).accessToken || "",
                    userId,
                };
                try {
                    const map = await prisma.whatsappMessageMap.findFirst({
                        where: { wpMsgId: idMessage, locationId },
                    });
                    if (map?.ghlMsgId && map.ghlMsgId !== 'PENDING') {
                        const resp = await updateMessageStatus(ghlAuth, map.ghlMsgId);
                        if (resp.success) {
                            console.log(`[TICKS] Updated GHL message ${map.ghlMsgId} to read (green ticks)`);
                            try {
                                await prisma.whatsappMessageMap.updateMany({
                                    where: { id: map.id },
                                    data: { readAt: new Date() } as any,
                                });
                            } catch (e) {
                                // non-fatal
                            }
                        } else {
                            console.warn(`[TICKS] Failed to update GHL message:`, resp.data);
                        }
                    } else {
                        console.log(`[TICKS] No map for wpMsgId=${idMessage}, skipping`);
                    }
                } catch (err: any) {
                    console.error("[TICKS] Error updating message status:", err?.message ?? err);
                }
            }
        }
        return { success: true };
    }

    // We already validated locationId and userId before enqueuing
    const { senderData, messageData } = body;

    // Fetch GHL Token
    const tokenRecord = await getToken(locationId, APP_ID);

    if (!tokenRecord || ("success" in tokenRecord && !tokenRecord.success)) {
        throw new Error(`Failed to get access token for location: ${locationId}`);
    }

    const accessToken = (tokenRecord as any).accessToken;

    const ghlAuth = {
        locationId: locationId,
        access_token: accessToken || "",
        userId: userId
    };

    // Parse Message
    let messageContent = "";
    const attachments: string[] = [];
    const typeMessage = messageData.typeMessage;

    // Helper: detect forwarded from webhook (ExtendedTextMessage / quotedMessage / fileMessage)
    const getIsForwarded = (): boolean => {
        const ext = messageData.extendedTextMessageData;
        if (ext && (ext.isForwarded === true || (typeof ext.forwardingScore === 'number' && ext.forwardingScore > 0))) return true;
        const file = messageData.fileMessageData;
        if (file && (file.isForwarded === true || (typeof file.forwardingScore === 'number' && file.forwardingScore > 0))) return true;
        return false;
    };

    switch (typeMessage) {
        case "textMessage":
            messageContent = messageData.textMessageData?.textMessage || "";
            break;

        case "extendedTextMessage":
            messageContent = messageData.extendedTextMessageData?.text || "";
            const extParams = messageData.extendedTextMessageData;
            if (extParams?.title) messageContent = `**${extParams.title}**\n${messageContent}`;
            if (extParams?.description) messageContent += `\n_${extParams.description}_`;
            break;

        case "quotedMessage":
            messageContent = messageData.extendedTextMessageData?.text ||
                messageData.textMessageData?.textMessage || "";
            break;

        case "editedMessage":
            messageContent = messageData.editedMessageData?.textMessage || "";
            messageContent = `[Edited] ${messageContent}`;
            break;

        case "imageMessage":
        case "videoMessage":
        case "documentMessage":
        case "stickerMessage":
            const fileData = messageData.fileMessageData;
            const url = fileData?.downloadUrl || fileData?.url;
            if (url) {
                attachments.push(url);
            }
            messageContent = fileData?.caption || "";
            if (typeMessage === 'stickerMessage' && !messageContent) messageContent = "[Sticker]";
            break;

        case "audioMessage":
            const audioUrl = messageData.fileMessageData?.downloadUrl;
            if (audioUrl) {
                try {
                    console.log(`Downloading audio from: ${audioUrl}`);
                    const fileResp = await axios.get(audioUrl, { responseType: "arraybuffer" });
                    const buffer = Buffer.from(fileResp.data);

                    console.log("Uploading audio to GHL Media Library...");
                    const uploadResp = await uploadFileToMediaLibrary(ghlAuth, "", buffer, "audio.mp3", "audio/mpeg");

                    if (uploadResp.success && uploadResp.data?.file?.url) {
                        attachments.push(uploadResp.data.file.url);
                    } else if (uploadResp.success && uploadResp.data?.url) {
                        attachments.push(uploadResp.data.url);
                    } else {
                        console.warn("GHL Upload failed or returned no URL, using original URL.");
                        attachments.push(audioUrl);
                    }
                } catch (e: any) {
                    console.error("Failed to download/upload audio:", e.message);
                    attachments.push(audioUrl);
                }
            }
            messageContent = messageData.fileMessageData?.caption || "";
            break;

        case "locationMessage":
            const loc = messageData.locationMessageData;
            messageContent = `Location: ${loc.nameLocation || 'Shared Location'}\n${loc.address || ''}\nhttps://maps.google.com/?q=${loc.latitude},${loc.longitude}`;
            break;

        case "contactMessage":
            const contact = messageData.contactMessageData;
            const phone = contact.vcard?.match(/waid=([\d]+)/)?.[1] ||
                contact.vcard?.match(/TEL;[^:]*:(.*)/)?.[1] || "";
            messageContent = `Contact: ${contact.displayName}\nPhone: ${phone}`;
            break;

        case "contactsArrayMessage":
            const arrayData = messageData.contactsArrayMessageData || messageData.messageData;
            const contacts = arrayData?.contacts || [];
            messageContent = `Shared Contacts:\n`;
            contacts.forEach((c: any) => {
                const p = c.vcard?.match(/waid=([\d]+)/)?.[1] || "";
                messageContent += `- ${c.displayName} (${p})\n`;
            });
            break;

        case "buttonsMessage":
            const btns = messageData.buttonsMessage;
            messageContent = `[Buttons] ${btns.contentText}`;
            if (btns.buttons) {
                messageContent += "\nOptions:\n" + btns.buttons.map((b: any) => `- ${b.buttonText}`).join('\n');
            }
            break;

        case "listMessage":
            const list = messageData.listMessage;
            messageContent = `[List] ${list.title || ''}\n${list.contentText}`;
            if (list.sections) {
                list.sections.forEach((s: any) => {
                    messageContent += `\n\n*${s.title}*`;
                    s.rows?.forEach((r: any) => {
                        messageContent += `\n- ${r.title}: ${r.description || ''}`;
                    });
                });
            }
            break;

        case "templateMessage":
            const tmpl = messageData.templateMessage;
            messageContent = `[Template] ${tmpl.contentText}`;
            if (tmpl.buttons) {
                messageContent += "\n\n" + tmpl.buttons.map((b: any) => {
                    if (b.urlButton) return `[Link: ${b.urlButton.displayText}](${b.urlButton.url})`;
                    if (b.callButton) return `[Call: ${b.callButton.displayText}](${b.callButton.phoneNumber})`;
                    if (b.quickReplyButton) return `[Button: ${b.quickReplyButton.displayText}]`;
                    return "";
                }).join('\n');
            }
            break;

        case "interactiveButtons":
            const ib = messageData.interactiveButtons;
            messageContent = `[Interactive] ${ib.titleText || ''}\n${ib.contentText}`;
            if (ib.buttons) {
                messageContent += "\n" + ib.buttons.map((b: any) => `[${b.buttonText}]`).join('  ');
            }
            break;

        case "interactiveButtonsReply":
            const ibr = messageData.interactiveButtonsReply;
            messageContent = `[Reply] ${ibr.titleText || ''}\n${ibr.contentText}`;
            if (ibr.buttons) {
                messageContent += "\nSelected: " + ibr.buttons.map((b: any) => b.buttonText).join(', ');
            }
            break;

        case "reactionMessage":
            const reaction = messageData.extendedTextMessageData?.text || messageData.reactionMessageData?.text || "Reaction";
            messageContent = `${reaction}`;
            break;

        case "pollMessage":
            const poll = messageData.pollMessageData;
            messageContent = `Poll: ${poll.name}\nOptions:\n${poll.options.map((o: any) => `- ${o.optionName}`).join('\n')}`;
            break;

        case "pollUpdateMessage":
            const pollUp = messageData.pollMessageData;
            messageContent = `Poll Vote: ${pollUp.name}`;
            break;

        case "groupInviteMessage":
            const invite = messageData.groupInviteMessageData;
            messageContent = `Group Invite: ${invite.groupName}\n${invite.caption || ''}\nLink Code: ${invite.inviteCode}`;
            break;

        default:
            console.log(`Unhandled message type: ${typeMessage}`);
            messageContent = `[Message Type: ${typeMessage}]`;
            if (messageData.extendedTextMessageData?.text) messageContent += `\n${messageData.extendedTextMessageData.text}`;
            break;
    }

    if (!messageContent && attachments.length === 0) {
        console.log("No text content or attachments found in message");
        return;
    }

    const isForwarded = getIsForwarded();

    // Parse Sender
    const isGroup = senderData.chatId.endsWith("@g.us");
    let contactPayload: ContactData = {};
    let groupIdCustomFieldId = "";
    let instanceIdCustomFieldId = "";
    let finalMessageContent = messageContent;

    if (isGroup) {
        console.log("Group message detected, fetching group data...");

        const idInstance = body.instanceData?.idInstance;
        let instance;
        if (idInstance) {
            instance = await prisma.whatsappInstance.findUnique({
                where: { idInstance: idInstance.toString() }
            });
        }
        if (!instance) {
            instance = await prisma.whatsappInstance.findFirst({
                where: { locationId, userId }
            });
        }

        let groupName = "Unknown Group";
        if (instance) {
            const groupData = await getGroupData(instance.apiUrl, instance.idInstance, instance.apiTokenInstance, senderData.chatId);
            if (groupData?.subject) {
                groupName = groupData.subject;
            }
        }

        const sanitizedGroupName = groupName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const email = `${sanitizedGroupName}_wpg@gmail.com`;

        contactPayload = {
            first_name: groupName,
            last_name: "",
            email: email
        };

        try {
            const fields = await setupCustomFields(locationId, [{ key: "Group ID" }, { key: "Instance ID" }], accessToken);
            if (fields && fields.length > 0) {
                const groupField = fields.find(f => f.name === "Group ID" || f.fieldKey === "contact.group_id");
                if (groupField) groupIdCustomFieldId = groupField.id;

                const instanceField = fields.find(f => f.name === "Instance ID" || f.fieldKey === "contact.instance_id");
                if (instanceField) instanceIdCustomFieldId = instanceField.id;
            }
        } catch (err) {
            console.error("Failed to setup Custom Fields", err);
        }

        const senderName = senderData.senderName || senderData.sender || "Unknown";
        finalMessageContent = `${messageContent}\n\nfrom ${senderName}`;

    } else {
        const rawPhone = senderData.chatId.replace("@c.us", "");
        const displayPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
        const genericNames = ["", "unknown", "unknown user", "whatsapp"];

        let firstName: string | undefined;
        let lastName: string | undefined;
        try {
            const searchRes = await searchContactByPhone(ghlAuth, { phone: displayPhone } as any);
            if (searchRes.success && searchRes.data) {
                const existing = searchRes.data as any;
                firstName = existing.firstName || existing.first_name || existing.name || undefined;
                lastName = existing.lastName || existing.last_name || undefined;
            }
        } catch (err) {
            console.error("WhatsApp webhook: searchContactByPhone failed, falling back to Green API name:", (err as any)?.message || err);
        }

        if (!firstName) {
            const fullName = (senderData.chatName || senderData.senderName || "").trim();
            const isGeneric = !fullName || genericNames.includes(fullName.toLowerCase());
            if (isGeneric) {
                firstName = displayPhone;
                lastName = "";
            } else {
                const nameParts = fullName.split(" ");
                firstName = nameParts[0] || displayPhone;
                lastName = nameParts.slice(1).join(" ") || "";
            }
        }

        try {
            const fields = await setupCustomFields(locationId, [{ key: "Instance ID" }], accessToken);
            const instanceField = fields.find(f => f.name === "Instance ID" || f.fieldKey === "contact.instance_id");
            if (instanceField) instanceIdCustomFieldId = instanceField.id;
        } catch (err) {
            console.error("Failed to setup Instance ID field", err);
        }

        contactPayload = {
            phone: rawPhone,
            first_name: firstName,
            last_name: lastName,
        };
    }

    console.log("Upserting contact:", contactPayload);
    const contactResp = await upsertContact(ghlAuth, contactPayload);

    if (!contactResp.success || !contactResp.data?.id) {
        throw new Error(`Contact upsert failed: ${JSON.stringify(contactResp)}`);
    }

    const contactId = contactResp.data.id;
    const customFieldsToUpdate = [];

    if (isGroup && groupIdCustomFieldId) {
        customFieldsToUpdate.push({ id: groupIdCustomFieldId, field_value: senderData.chatId });
    }

    if (instanceIdCustomFieldId && body.instanceData?.idInstance) {
        customFieldsToUpdate.push({ id: instanceIdCustomFieldId, field_value: body.instanceData.idInstance.toString() });
    }

    if (customFieldsToUpdate.length > 0) {
        await updateContact(ghlAuth, {
            contactId: contactId,
            customFields: customFieldsToUpdate
        });
    }

    if (body.typeWebhook === "incomingMessageReceived") {
        const conversationsResp = await searchConversation(ghlAuth, contactId);
        let conversationId;

        if (conversationsResp.success && conversationsResp.data?.length > 0) {
            conversationId = conversationsResp.data[0].id;
        } else {
            console.log("No conversation found, creating new one...");
            const createConvResp = await createConversation(ghlAuth, contactId);
            if (createConvResp.success) {
                conversationId = createConvResp.data.id;
            }
        }

        if (conversationId) {
            const stanzaId = extractStanzaId(messageData, body);
            console.log(`[DEBUG] Extracted stanzaId: ${stanzaId} for message ${body.idMessage}`);

            let replyMessageId: string | undefined;
            if (stanzaId && stanzaId.trim()) {
                const quotedMap = await prisma.whatsappMessageMap.findFirst({
                    where: { wpMsgId: stanzaId.trim(), locationId },
                });
                if (quotedMap?.ghlMsgId) {
                    replyMessageId = quotedMap.ghlMsgId;
                    console.log(`[REPLY] Inbound reply to GHL message ${replyMessageId} (stanzaId=${stanzaId})`);
                }
            }

            const msgData: ContactData = {
                contactId: contactId,
                conversationId: conversationId,
                message: finalMessageContent,
                ...(attachments.length > 0 && { attachments }),
                ...(replyMessageId && { replyMessageId }),
                ...(replyMessageId && { threadId: replyMessageId }),
            };

            const msgResp = await addMessageToConversation(ghlAuth, msgData);
            const ghlMessageId = msgResp.success && msgResp.data ? getGhlMessageIdFromResponse(msgResp.data) : null;
            if (ghlMessageId) {
                await updateMessageStatus(ghlAuth, ghlMessageId);

                try {
                    await prisma.whatsappMessageMap.create({
                        data: {
                            wpMsgId: body.idMessage,
                            ghlMsgId: ghlMessageId,
                            locationId: locationId,
                            fromChatId: senderData.chatId,
                            toChatId: body.instanceData?.wid.replace("@c.us", "").replace("@g.us", "") || body.instanceData?.idInstance?.toString() || "",
                            stanzaId: stanzaId || "",
                            isForwarded: isForwarded || undefined,
                            attachments: attachments.length > 0 ? attachments : undefined
                        }
                    });
                    console.log(`[SUCCESS] Message map created for wpMsgId: ${body.idMessage}, ghlMsgId: ${ghlMessageId}, stanzaId: ${stanzaId}`);
                } catch (mapErr: any) {
                    console.error("Failed to insert message map:", mapErr);
                    console.error("Error details:", {
                        message: mapErr.message,
                        code: mapErr.code,
                        meta: mapErr.meta
                    });
                    throw mapErr;
                }

                // --- TRIGGER LOGIC ---
                try {
                    const triggers = await prisma.trigger.findMany({
                        where: {
                            locationId: locationId,
                            key: "message_received_kleegr_whatsapp",
                            eventType: { not: "DELETED" }
                        }
                    });

                    if (triggers.length > 0) {
                        const sanitizedFrom = senderData.chatId.replace("@c.us", "").replace("@g.us", "");
                        const rawTo = body.instanceData?.wid || body.instanceData?.idInstance?.toString() || "";
                        const sanitizedTo = rawTo.replace("@c.us", "").replace("@g.us", "");

                        const eventData = {
                            body: finalMessageContent,
                            from: sanitizedFrom,
                            to: sanitizedTo,
                            direction: "inbound",
                            messageType: "WhatsApp",
                            locationId,
                            contactId
                        };

                        for (const trigger of triggers) {
                            let match = true;
                            if (trigger.filters) {
                                const filterArray = Array.isArray(trigger.filters) ? trigger.filters : [trigger.filters];
                                for (const f of filterArray) {
                                    if (!matchFilter(f, eventData)) {
                                        match = false;
                                        break;
                                    }
                                }
                            }

                            if (match) {
                                console.log(`[TRIGGER] Executing Trigger ${trigger.ghlId} -> ${trigger.targetUrl}`);
                                const payload = {
                                    type: "WhatsAppMessage",
                                    locationId,
                                    contactId,
                                    conversationId,
                                    body: finalMessageContent,
                                    direction: "inbound",
                                    messageType: "WhatsApp",
                                    from: sanitizedFrom,
                                    to: sanitizedTo,
                                    emailMessageId: ghlMessageId,
                                    threadId: stanzaId || ghlMessageId,
                                    attachments: attachments.length > 0 ? attachments : undefined
                                };

                                try {
                                    await axios.post(trigger.targetUrl, payload, {
                                        headers: {
                                            'Content-Type': 'application/json',
                                            'Version': '2021-07-28',
                                            'Authorization': `Bearer ${accessToken}`
                                        }
                                    });
                                    console.log(`[TRIGGER] Webhook sent for trigger ${trigger.ghlId}`);
                                } catch (err: any) {
                                    console.error(`[TRIGGER] Failed to send webhook for trigger ${trigger.ghlId}:`, err.message);
                                }
                            }
                        }
                    }
                } catch (triggerErr) {
                    console.error("[TRIGGER] Error processing triggers:", triggerErr);
                }
                // --- END TRIGGER ---
            }
        }
    } else if (body.typeWebhook === "outgoingMessageReceived") {
        const idMessage = body.idMessage;
        const msgPreview = (messageContent || "").substring(0, 40);
        console.log(`[WHATSAPP-DUP] outgoingMessageReceived idMessage=${idMessage} chatId=${senderData?.chatId} msg="${msgPreview}..."`);

        let existingMap: Awaited<ReturnType<typeof prisma.whatsappMessageMap.findFirst>> = null;
        if (idMessage) {
            const idemKey = `processed_outgoing:${idMessage}`;
            const idemSet = await connection.set(idemKey, "1", "EX", 120, "NX");
            if (!idemSet) {
                console.log(`[WHATSAPP-DUP] SKIP duplicate idMessage: ${idMessage}`);
                return { success: true };
            }
            if (await connection.get(`reply_adding:${locationId}:${idMessage}`)) {
                console.log(`[WHATSAPP-DUP] SKIP - reply API is adding this message (${idMessage})`);
                return { success: true };
            }
            existingMap = await prisma.whatsappMessageMap.findFirst({
                where: { wpMsgId: idMessage, locationId },
            });
            if (existingMap && existingMap.ghlMsgId && existingMap.ghlMsgId.length > 0 && existingMap.ghlMsgId !== 'PENDING') {
                console.log(`[WHATSAPP-DUP] SKIP sync - message already in GHL (ghlMsgId=${existingMap.ghlMsgId})`);
                return { success: true };
            }
        }

        const targetChatId = senderData.chatId;
        if (targetChatId && messageContent) {
            const hash = Buffer.from(messageContent).toString('base64');
            const lockKey = `ignore_outbound:${targetChatId}:${hash}`;
            const isLocked = await connection.get(lockKey);

            console.log(`[DEBUG] Checking Lock: ${lockKey} -> Found: ${isLocked}`);

            if (isLocked) {
                console.log(`Ignoring outbound webhook (Duplicate/Loop protection): ${messageContent.substring(0, 50)}...`);
                return { success: true };
            }

            await connection.set(lockKey, "1", "EX", 60);
            console.log(`[DEBUG] Set outbound lock: ${lockKey}`);

            if (contactId) {
                const contactLockKey = `ignore_outbound:${contactId}:${hash}`;
                await connection.set(contactLockKey, "1", "EX", 60);
                console.log(`[WHATSAPP-DUP] Set echo lock by contactId: ${contactLockKey}`);
            }

            const syncLockKey = `recent_sync:${hash}`;
            await connection.set(syncLockKey, "1", "EX", 30);
            console.log(`[DEBUG] Set Echo Shield: ${syncLockKey}`);
        }

        if (contactId && attachments.length > 0) {
            const firstUrl = attachments[0];
            const mediaHash = Buffer.from(firstUrl).toString('base64').slice(0, 64);
            const mediaLockKey = `recent_sync_media:${contactId}:${mediaHash}`;
            await connection.set(mediaLockKey, "1", "EX", 45);
            console.log(`[WHATSAPP-DUP] Set media echo lock: recent_sync_media:${contactId}:...`);
        }

        console.log(`[WHATSAPP-DUP] SYNC to GHL contactId=${contactId} (will NOT send to WA again)`);
        const stanzaIdOut = extractStanzaId(messageData, body);
        let replyMessageIdOut: string | undefined;
        if (existingMap?.ghlMsgId === 'PENDING' && (existingMap as any).replyToGhlMsgId) {
            replyMessageIdOut = (existingMap as any).replyToGhlMsgId;
            console.log(`[REPLY] Reply from GHL: threading to ghlMsgId=${replyMessageIdOut}`);
        } else if (stanzaIdOut && stanzaIdOut.trim()) {
            const quotedMapOut = await prisma.whatsappMessageMap.findFirst({
                where: { wpMsgId: stanzaIdOut.trim(), locationId },
            });
            if (quotedMapOut?.ghlMsgId) {
                replyMessageIdOut = quotedMapOut.ghlMsgId;
                console.log(`[REPLY] Outbound reply to GHL message ${replyMessageIdOut} (stanzaId=${stanzaIdOut})`);
            }
        }
        const msgData: ContactData = {
            contactId: contactId,
            message: messageContent,
            ...(attachments.length > 0 && { attachments }),
            status: "read",
            ...(replyMessageIdOut && { replyMessageId: replyMessageIdOut }),
            ...(replyMessageIdOut && { threadId: replyMessageIdOut }),
        };
        const msgResp = await sentOutboundMessage(ghlAuth, msgData);
        const ghlMessageIdOut = msgResp.success && msgResp.data ? getGhlMessageIdFromResponse(msgResp.data) : null;

        if (ghlMessageIdOut) {
            if (existingMap?.ghlMsgId === 'PENDING') {
                try {
                    await prisma.whatsappMessageMap.updateMany({
                        where: { id: existingMap.id },
                        data: { ghlMsgId: ghlMessageIdOut } as any,
                    });
                    console.log(`[WHATSAPP-DUP] Updated PENDING map with ghlMsgId=${ghlMessageIdOut}`);
                } catch (e: any) {
                    console.warn('[WHATSAPP-DUP] PENDING map update failed:', e?.message);
                }
                if (contactId && messageContent) {
                    const echoKey = `ghl_added_by_us:${locationId}:${contactId}:${Buffer.from(messageContent).toString('base64')}`;
                    await connection.set(echoKey, '1', 'EX', 30);
                }
            } else {
                const stanzaId = extractStanzaId(messageData, body);
                try {
                    await prisma.whatsappMessageMap.create({
                        data: {
                            wpMsgId: body.idMessage,
                            ghlMsgId: ghlMessageIdOut,
                            locationId: locationId,
                            fromChatId: senderData.chatId,
                            toChatId: body.instanceData?.wid || body.instanceData?.idInstance?.toString() || "",
                            stanzaId: stanzaId || "",
                            attachments: attachments.length > 0 ? attachments : undefined
                        }
                    });
                    console.log(`[SUCCESS] Message map created for outgoing wpMsgId: ${body.idMessage}, ghlMsgId: ${ghlMessageIdOut}`);
                } catch (mapErr: any) {
                    console.error("Failed to insert message map:", mapErr?.message);
                    throw mapErr;
                }
            }
        } else {
            console.warn(`[WhatsAppMessageMap] Outbound: No message ID in GHL response - map NOT saved. Raw response keys:`, msgResp.data ? Object.keys(msgResp.data) : "no data");
        }
    } else if (body.typeWebhook === "outgoingAPIMessageReceived") {
        console.log("Ignoring outgoingAPIMessageReceived to prevent loop.");
        return { success: true };
    } else if (body.typeWebhook === "outgoingMessageStatus") {
        return { success: true }; // Handled at start of worker
    } else {
        console.log(`Unhandled webhook type: ${body.typeWebhook}`);
    }

    return { success: true };

}, { connection: connection as any, concurrency: PROCESS_CONCURRENCY });

worker.on('completed', job => {
    console.log(`${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    console.log(`${job?.id} has failed with ${err.message}`);
});

console.log("Worker started, listening for jobs...");

const syncWorker = new Worker('sync-processing', async (job: Job) => {
    if (job.name === 'sync-history') {
        const { idInstance, chatId, contactId, locationId, userId, conversationId } = job.data;
        console.log(`Processing history sync job ${job.id} for ${chatId}`);

        const instance = await prisma.whatsappInstance.findUnique({
            where: { idInstance: idInstance.toString() }
        });

        if (!instance) {
            throw new Error("Instance not found");
        }

        const { apiTokenInstance, apiUrl } = instance;

        console.log(`Fetching history for ${chatId}...`);
        const history = await getChatHistory(apiUrl, idInstance, apiTokenInstance, chatId, 500);

        if (!history || !Array.isArray(history) || history.length === 0) {
            console.log(`No history found for ${chatId}`);
            return;
        }

        console.log(`Found ${history.length} messages for ${chatId}. Syncing to GHL...`);

        const tokenRecord = await getToken(locationId, APP_ID);
        if (!tokenRecord || ("success" in tokenRecord && !tokenRecord.success)) {
            throw new Error("Failed to get GHL token");
        }
        const accessToken = (tokenRecord as any).accessToken;
        const ghlAuth = {
            locationId: locationId,
            access_token: accessToken || "",
            userId: userId
        };

        const sortedHistory = history.reverse();

        for (const msg of sortedHistory) {
            if (msg.isDeleted || msg.typeMessage === 'systemMessage') continue;

            let messageContent = msg.textMessage || "";
            const attachments: string[] = [];

            if (msg.extendedTextMessage?.text) {
                messageContent = msg.extendedTextMessage.text;
            }

            if (msg.downloadUrl) {
                const isAudio = msg.typeMessage === 'audioMessage';

                if (isAudio && msg.downloadUrl) {
                    try {
                        const fileResp = await axios.get(msg.downloadUrl, { responseType: "arraybuffer" });
                        const buffer = Buffer.from(fileResp.data);
                        const uploadResp = await uploadFileToMediaLibrary(ghlAuth, "", buffer, "audio.mp3", "audio/mpeg");

                        if (uploadResp.success && uploadResp.data?.file?.url) {
                            attachments.push(uploadResp.data.file.url);
                        } else if (uploadResp.success && uploadResp.data?.url) {
                            attachments.push(uploadResp.data.url);
                        } else {
                            attachments.push(msg.downloadUrl);
                        }
                    } catch (e: any) {
                        console.error("Failed to upload sync audio to GHL:", e.message);
                        attachments.push(msg.downloadUrl);
                    }
                } else {
                    attachments.push(msg.downloadUrl);
                }
            }

            if (msg.caption && !messageContent) {
                messageContent = msg.caption;
            }

            if (!messageContent && attachments.length === 0) continue;

            const isIncoming = msg.type === "incoming";

            try {
                if (isIncoming) {
                    const msgData: ContactData = {
                        contactId: contactId,
                        conversationId: conversationId,
                        message: messageContent,
                        ...(attachments.length > 0 && { attachments }),
                    };
                    await addMessageToConversation(ghlAuth, msgData);
                } else {
                    const lockKey = `ignore_outbound:${contactId}:${Buffer.from(messageContent).toString('base64')}`;
                    await connection.set(lockKey, "1", "EX", 30);

                    const msgData: ContactData = {
                        contactId: contactId,
                        message: messageContent,
                        ...(attachments.length > 0 && { attachments }),
                        status: "read",
                    };
                    await sentOutboundMessage(ghlAuth, msgData);
                }
            } catch (err: any) {
                console.error(`Failed to sync message ${msg.idMessage}:`, err.message);
            }

            await new Promise(r => setTimeout(r, 200));
        }

        console.log(`Sync complete for ${chatId}`);

    } else if (job.name === 'sync-contacts') {
        const { idInstance } = job.data;
        console.log(`Processing contact sync for instance ${idInstance}`);

        const instance = await prisma.whatsappInstance.findUnique({
            where: { idInstance: idInstance.toString() }
        });

        if (!instance) {
            throw new Error("Instance not found");
        }

        const { locationId, userId, apiTokenInstance, apiUrl, name } = instance;

        if (!locationId || !apiTokenInstance || !apiUrl) {
            throw new Error("Instance configuration invalid");
        }

        const safeName = (name || "user").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const tag = `${safeName}_wp_contact`;

        const tokenRecord = await getToken(locationId, APP_ID);
        if (!tokenRecord || ("success" in tokenRecord && !tokenRecord.success)) {
            throw new Error("Failed to get GHL token");
        }
        const accessToken = (tokenRecord as any).accessToken;

        let instanceFieldId = "";
        let groupFieldId = "";

        try {
            const fields = await setupCustomFields(locationId, [{ key: "Instance ID" }, { key: "Group ID" }], accessToken);
            const iField = fields.find(f => f.name === "Instance ID" || f.fieldKey === "contact.instance_id");
            if (iField) instanceFieldId = iField.id;
            const gField = fields.find(f => f.name === "Group ID" || f.fieldKey === "contact.group_id");
            if (gField) groupFieldId = gField.id;
        } catch (e) {
            console.error("Error setting up custom fields:", e);
        }

        const contacts = await getContacts(apiUrl, idInstance, apiTokenInstance);
        if (!Array.isArray(contacts)) {
            throw new Error("Failed to fetch contacts from GreenAPI");
        }

        console.log(`Fetched ${contacts.length} contacts for instance ${idInstance}. Upserting...`);

        const ghlAuth = {
            locationId,
            access_token: accessToken,
            userId
        };

        const { syncQueue } = await import('./queue');

        for (const contact of contacts) {
            try {
                const contactPayload: ContactData = {
                    tags: [tag]
                };

                const customFields = [];
                if (instanceFieldId) {
                    customFields.push({ id: instanceFieldId, field_value: idInstance.toString() });
                }

                if (contact.type === "group") {
                    const groupName = contact.name || "Unknown Group";
                    const sanitizedGroupName = groupName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
                    const email = `${sanitizedGroupName}_wpg@gmail.com`;
                    contactPayload.first_name = groupName;
                    contactPayload.email = email;
                    if (groupFieldId) {
                        customFields.push({ id: groupFieldId, field_value: contact.id });
                    }
                } else {
                    if (!contact.id) continue;
                    const rawPhone = contact.id.replace("@c.us", "");
                    const displayPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
                    const genericNames = ["", "unknown", "unknown user", "whatsapp"];

                    let firstName: string | undefined;
                    let lastName: string | undefined;
                    try {
                        const searchRes = await searchContactByPhone(ghlAuth, { phone: displayPhone } as any);
                        if (searchRes.success && searchRes.data) {
                            const existing = searchRes.data as any;
                            firstName = existing.firstName || existing.first_name || existing.name || undefined;
                            lastName = existing.lastName || existing.last_name || undefined;
                        }
                    } catch (err) {
                        console.error("WhatsApp sync-contacts: searchContactByPhone failed, falling back to Green API name:", (err as any)?.message || err);
                    }

                    if (!firstName) {
                        const fullName = (contact.name || contact.contactName || "").trim();
                        const isGeneric = !fullName || genericNames.includes(fullName.toLowerCase());
                        if (isGeneric) {
                            firstName = displayPhone;
                            lastName = "";
                        } else {
                            const nameParts = fullName.split(" ");
                            firstName = nameParts[0] || displayPhone;
                            lastName = nameParts.slice(1).join(" ") || "";
                        }
                    }

                    contactPayload.first_name = firstName;
                    contactPayload.last_name = lastName;
                    contactPayload.phone = `+${rawPhone}`;
                }

                if (customFields.length > 0) {
                    contactPayload.customFields = customFields;
                }

                const upsertRes = await upsertContact(ghlAuth, contactPayload);

                if (upsertRes && upsertRes.success && upsertRes.data) {
                    const newContactId = (upsertRes.data as any).id;
                    if (newContactId) {
                        const searchRes = await searchConversation(ghlAuth, newContactId, 1);
                        let conversationId = "";

                        if (searchRes.success && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                            conversationId = searchRes.data[0].id;
                        } else {
                            const createRes = await createConversation(ghlAuth, newContactId);
                            if (createRes.success && createRes.data) {
                                conversationId = createRes.data.id;
                            }
                        }

                        if (conversationId) {
                            syncQueue.add("sync-history", {
                                idInstance,
                                chatId: contact.id,
                                contactId: newContactId,
                                locationId,
                                userId,
                                conversationId
                            }, {
                                removeOnComplete: true,
                                removeOnFail: 1000
                            });
                        }
                    }
                }

            } catch (err) {
                console.error(`Failed to process contact ${contact.id}:`, err);
            }
        }
        console.log(`Contact sync finished for instance ${idInstance}`);
    }

}, { connection: connection as any, concurrency: 2 });

syncWorker.on('completed', job => {
    console.log(`Sync job ${job.id} completed`);
});
syncWorker.on('failed', (job, err) => {
    console.log(`Sync job ${job?.id} failed: ${err.message}`);
});

const outboundWorker = new Worker('outbound-processing', async (job: Job) => {
    console.log(`Processing outbound job ${job.id}`);
    const body = job.data;
    const { message, locationId } = body;
    const userId = body.userId ? body.userId : body.customUserId;

    if (!locationId) {
        throw new Error("locationId is required");
    }

    let instance = await prisma.whatsappInstance.findFirst({
        where: { locationId: locationId, userId: userId },
        orderBy: { createdAt: 'desc' }
    });

    if (!instance) {
        console.log(`No specific instance for user ${userId}, falling back to location-wide instance.`);
        instance = await prisma.whatsappInstance.findFirst({
            where: { locationId: locationId },
            orderBy: { createdAt: 'desc' }
        });
    }

    if (!instance) {
        throw new Error(`No WhatsApp instance found for locationId: ${locationId}`);
    }

    let { idInstance, apiTokenInstance, apiUrl } = instance;
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;

    console.log(`[DEBUG] Selected Instance: ${idInstance} at ${baseUrl}`);

    let chatId = body.phone ? `${body.phone.slice(1)}@c.us` : '';
    let shouldUpdateContactInstance = false;
    let ghlAuthForUpdate: any = null;

    if (body?.contactId && body?.locationId) {
        try {
            const tokenResponse = await getToken(body.locationId, APP_ID);
            if (tokenResponse && (tokenResponse as any).accessToken) {
                const ghlAuth = {
                    locationId: body.locationId,
                    access_token: (tokenResponse as any).accessToken,
                    userId: body.userId
                };
                ghlAuthForUpdate = ghlAuth;

                if (!chatId || chatId.includes("@c.us")) {
                    const groupId = await getCustomFieldValue(ghlAuth, body.contactId, "Group ID");
                    if (groupId) {
                        chatId = groupId;
                        console.log(`[DEBUG] Overriding ChatID with Group ID: ${chatId}`);
                    }
                }

                const instanceIdVal = await getCustomFieldValue(ghlAuth, body.contactId, "Instance ID");
                if (instanceIdVal) {
                    const specificInstance = await prisma.whatsappInstance.findUnique({
                        where: { idInstance: instanceIdVal }
                    });

                    if (specificInstance) {
                        instance = specificInstance;
                        idInstance = instance.idInstance;
                        apiTokenInstance = instance.apiTokenInstance;
                        apiUrl = instance.apiUrl;
                        console.log(`[DEBUG] Switching to Specific Instance: ${idInstance}`);
                    } else {
                        shouldUpdateContactInstance = true;
                    }
                } else {
                    shouldUpdateContactInstance = true;
                }
            }
        } catch (err) {
            console.error("Error checking Group/Instance ID in worker:", err);
        }
    }

    if (!chatId) {
        throw new Error("Could not determine chatId. No phone number and no Group ID found.");
    }

    console.log(`[DEBUG] Final ChatID: ${chatId}`);

    if (chatId && message) {
        const lockKey = `ignore_outbound:${chatId}:${Buffer.from(message).toString('base64')}`;
        await connection.set(lockKey, "1", "EX", 60);
        console.log(`[DEBUG] Set Lock: ${lockKey}`);
    }

    let response;
    try {
        if (body?.attachments?.length > 0) {
            const url = `${baseUrl}waInstance${idInstance}/sendFileByUrl/${apiTokenInstance}`;
            const urlFile = body.attachments[0];
            const fileName = urlFile.split('/').pop()?.split('?')[0];

            console.log(`[WHATSAPP-DUP] GreenAPI SEND FILE chatId=${chatId}`);

            response = await axios.post(url, {
                chatId: chatId,
                urlFile: urlFile,
                fileName: fileName,
                caption: message
            }, { headers: { 'Content-Type': 'application/json' } });

        } else {
            const url = `${baseUrl}waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
            const msgHash = Buffer.from(message).toString('base64');
            console.log(`[WHATSAPP-DUP] GreenAPI SEND chatId=${chatId} hash=${msgHash.substring(0, 12)}...`);

            response = await axios.post(url, {
                chatId: chatId,
                message
            }, { headers: { 'Content-Type': 'application/json' } });
        }

        console.log(`[WHATSAPP-DUP] GreenAPI response:`, response?.data?.idMessage || response?.data);

        const idMessage = response?.data?.idMessage;
        if (idMessage) {
            const ghlMsgId = (body.ghlMessageId || body.messageId || 'PENDING') as string;
            try {
                await prisma.whatsappMessageMap.create({
                    data: {
                        wpMsgId: idMessage,
                        ghlMsgId,
                        locationId: body.locationId,
                        fromChatId: chatId,
                        toChatId: instance.apiUrl || '',
                        stanzaId: '',
                    } as any,
                });
                console.log(`[WHATSAPP-DUP] Outbound map created wpMsgId=${idMessage} ghlMsgId=${ghlMsgId}`);
            } catch (mapErr: any) {
                if (mapErr?.code !== 'P2002') console.warn('[WHATSAPP-DUP] Outbound map create failed:', mapErr?.message);
            }
        }
    } catch (apiError: any) {
        console.error(`[ERROR] GreenAPI Call Failed:`, apiError.message);
        if (apiError.response) {
            console.error(`[ERROR] Response Status: ${apiError.response.status}`);
            console.error(`[ERROR] Response Data:`, apiError.response.data);
        }
        throw apiError;
    }

    if (shouldUpdateContactInstance && ghlAuthForUpdate && body.contactId && !chatId.endsWith("@g.us")) {
        try {
            const fields = await setupCustomFields(locationId, [{ key: "Instance ID" }], ghlAuthForUpdate.access_token);
            const instanceField = fields.find(f => f.name === "Instance ID" || f.fieldKey === "contact.instance_id");

            if (instanceField) {
                await updateContact(ghlAuthForUpdate, {
                    contactId: body.contactId,
                    customFields: [{ id: instanceField.id, field_value: idInstance }]
                });
                console.log(`[DEBUG] Updated Contact Instance ID to ${idInstance}`);
            }
        } catch (updateErr) {
            console.error("Failed to update contact with Instance ID in worker:", updateErr);
        }
    }

    return response.data;

}, { connection: connection as any, concurrency: 5 });

outboundWorker.on('completed', job => {
    console.log(`Outbound job ${job.id} completed`);
});
outboundWorker.on('failed', (job, err) => {
    console.log(`Outbound job ${job?.id} failed: ${err.message}`);
});
