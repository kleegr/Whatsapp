
import { NextResponse } from "next/server";
import { connection, outboundQueue } from "../../../lib/queue";

export async function POST(req: Request) {
    try {
        const body = await req.json();

        const { message, locationId } = body;
        const attachments = body.attachments as string[] | undefined;
        const msgPreview = (message || "").substring(0, 50);
        console.log(`[WHATSAPP-DUP] send-message called contactId=${body.contactId} locationId=${locationId} msg="${msgPreview}..." attachments=${attachments?.length ?? 0}`);

        // GHL echo: We added this message via reply-message or forward-message API; GHL then triggers send-message. Skip so we don't send to WA again.
        if (body.contactId && message) {
            const msgHash = Buffer.from(String(message).trim()).toString("base64");
            const addedByUsKey = `ghl_added_by_us:${locationId}:${body.contactId}:${msgHash}`;
            const addedByUs = await connection.get(addedByUsKey);
            if (addedByUs) {
                console.log(`[WHATSAPP-DUP] SKIP send (GHL echo): we added this message via reply/forward API`);
                return NextResponse.json({ success: true, skipped: true, reason: "Message added by reply/forward API" });
            }
        }

        // MEDIA ECHO: When agent sends audio/image from phone we sync to GHL; GHL echoes with attachments (often no text).
        // Worker sets recent_sync_media:{contactId}:{hash(firstAttachmentUrl)}. Skip if that lock exists.
        if (body.contactId && attachments && attachments.length > 0) {
            const firstUrl = typeof attachments[0] === "string" ? attachments[0] : (attachments[0] as any)?.url;
            if (firstUrl) {
                const mediaHash = Buffer.from(firstUrl).toString("base64").slice(0, 64);
                const mediaLockKey = `recent_sync_media:${body.contactId}:${mediaHash}`;
                const isMediaEcho = await connection.get(mediaLockKey);
                if (isMediaEcho) {
                    console.log(`[WHATSAPP-DUP] SKIP send (media echo): recent_sync_media hit`);
                    return NextResponse.json({ success: true, skipped: true, reason: "Filtered by Media Echo Lock" });
                }
            }
        }

        // Prevent loop: Check Redis for lock (ignore_outbound:{contactId}:{message_hash})
        // Also check RECENT_SYNC lock to prevent GHL Echo Loop
        if (message) {
            const msgHash = Buffer.from(message).toString('base64');

            // 1. Check if we recently SYNCED this message (Phone -> GHL -> Echo)
            const syncLockKey = `recent_sync:${msgHash}`;
            const isSynced = await connection.get(syncLockKey);
            if (isSynced) {
                console.log(`[WHATSAPP-DUP] SKIP send (echo): recent_sync hit`);
                return NextResponse.json({ success: true, skipped: true, reason: "Filtered by Echo Lock" });
            }

            // 2. Check traditional Outbound Lock (contactId key set by worker when syncing from phone)
            if (body.contactId) {
                const lockKey = `ignore_outbound:${body.contactId}:${msgHash}`;
                const isLocked = await connection.get(lockKey);

                if (isLocked) {
                    console.log(`[WHATSAPP-DUP] SKIP send (lock): ignore_outbound contactId hit`);
                    return NextResponse.json({ success: true, skipped: true, reason: "Filtered by Sync Lock" });
                }
            }

            // 3. Deduplication Check (Prevent multiple webhooks for same message)
            const recipientId = body.contactId || body.phone || "unknown";
            const dedupKey = `dedup:outbound:${locationId}:${recipientId}:${msgHash}`;
            const isDuplicate = await connection.get(dedupKey);

            if (isDuplicate) {
                console.log(`[WHATSAPP-DUP] SKIP send (dedup): duplicate request`);
                return NextResponse.json({ success: true, skipped: true, reason: "Duplicate Request" });
            }

            // Set deduplication lock
            await connection.set(dedupKey, "1", "EX", 5);
        }

        // If only attachments and no message, still apply dedup for media
        if (body.contactId && attachments && attachments.length > 0 && !message) {
            const firstUrl = typeof attachments[0] === "string" ? attachments[0] : (attachments[0] as any)?.url;
            if (firstUrl) {
                const mediaHash = Buffer.from(firstUrl).toString("base64").slice(0, 64);
                const dedupKey = `dedup:outbound:${locationId}:${body.contactId}:media:${mediaHash}`;
                const isDup = await connection.get(dedupKey);
                if (isDup) {
                    console.log(`[WHATSAPP-DUP] SKIP send (dedup): duplicate media request`);
                    return NextResponse.json({ success: true, skipped: true, reason: "Duplicate Request" });
                }
                await connection.set(dedupKey, "1", "EX", 10);
            }
        }

        console.log(`[WHATSAPP-DUP] send-message QUEUED (will send to WhatsApp)`);

        const userId = body.userId ? body.userId : body.customUserId;

        if (!locationId) {
            return NextResponse.json(
                { error: "locationId is required" },
                { status: 400 }
            );
        }

        // Add to Queue
        await outboundQueue.add('send-message', body, {
            removeOnComplete: true,
            removeOnFail: 5000
        });

        // Return success immediately (Async processing)
        return NextResponse.json({ success: true, status: "queued" });

    } catch (error: any) {
        console.error("Error queueing message:", error);
        return NextResponse.json(
            { error: "Failed to queue message", details: error.message },
            { status: 500 }
        );
    }
}
