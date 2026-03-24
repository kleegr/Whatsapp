import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getContacts } from "../../../../lib/greenapi";
import { getToken } from "../../../../lib/token";
import { setupCustomFields, upsertContact, createConversation, searchConversation, ContactData } from "../../../../lib/ghl";
import { syncQueue } from "../../../../lib/queue";

const APP_ID = process.env.GHL_APP_ID!;

export const runtime = 'nodejs';


export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { idInstance } = body;

        if (!idInstance) {
            return NextResponse.json({ success: false, error: "idInstance is required" }, { status: 400 });
        }

        const encoder = new TextEncoder();

        const customReadable = new ReadableStream({
            async start(controller) {
                const sendEvent = (data: any) => {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
                };

                try {
                    const instance = await prisma.whatsappInstance.findUnique({
                        where: { idInstance: idInstance.toString() }
                    });

                    if (!instance) {
                        sendEvent({ error: "Instance not found" });
                        controller.close();
                        return;
                    }

                    const { locationId, userId, apiTokenInstance, apiUrl, name } = instance;

                    if (!locationId || !apiTokenInstance || !apiUrl) {
                        sendEvent({ error: "Instance configuration invalid" });
                        controller.close();
                        return;
                    }

                    const safeName = (name || "user").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
                    const tag = `${safeName}_wp_contact`;

                    const tokenRecord = await getToken(locationId, APP_ID);
                    if (!tokenRecord || ("success" in tokenRecord && !tokenRecord.success)) {
                        sendEvent({ error: "Failed to get GHL token" });
                        controller.close();
                        return;
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
                        sendEvent({ error: "Failed to fetch contacts from GreenAPI" });
                        controller.close();
                        return;
                    }

                    const total = contacts.length;
                    sendEvent({ type: 'start', total: total });

                    console.log(`Fetched ${total} contacts for instance ${idInstance}. Starting upsert...`);

                    const ghlAuth = {
                        locationId,
                        access_token: accessToken,
                        userId
                    };

                    let processedCount = 0;

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
                                if (!contact.id) {
                                    processedCount++;
                                    sendEvent({ type: 'progress', processed: processedCount, total });
                                    continue;
                                }

                                const rawPhone = contact.id.replace("@c.us", "");
                                const displayPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;

                                const fullName = (contact.name || contact.contactName || "").trim();
                                const genericNames = ["", "unknown", "unknown user", "whatsapp"];
                                const isGeneric = !fullName || genericNames.includes(fullName.toLowerCase());
                                if (isGeneric) {
                                    contactPayload.first_name = displayPhone;
                                    contactPayload.last_name = "";
                                } else {
                                    const nameParts = fullName.split(" ");
                                    contactPayload.first_name = nameParts[0] || displayPhone;
                                    contactPayload.last_name = nameParts.slice(1).join(" ") || "";
                                }
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
                            console.error(`Failed to upsert contact ${contact.id}:`, err);
                        } finally {
                            processedCount++;
                            sendEvent({ type: 'progress', processed: processedCount, total });
                        }
                    }

                    sendEvent({ type: 'done', total: total, processed: processedCount });
                    controller.close();

                } catch (error: any) {
                    console.error("Sync Stream Error:", error);
                    sendEvent({ error: error.message });
                    controller.close();
                }
            }
        });

        return new NextResponse(customReadable, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        });

    } catch (error: any) {
        console.error("Sync Contacts Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
