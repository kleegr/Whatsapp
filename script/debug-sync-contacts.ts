/**
 * Local debugger for WhatsApp → GHL contact sync prerequisites.
 *
 * Usage (from repo root, with DATABASE_URL, GHL_*, etc. in env — e.g. copy .env.local):
 *   npx tsx script/debug-sync-contacts.ts --locationId <loc> --idInstance <instance>
 *
 * Optional:
 *   --probe-ghl   Upsert first personal contact, then search/create GHL conversation (same as sync pipeline).
 *                 Chat message import is NOT run here — that is BullMQ job "sync-history" (requires `npm run worker`).
 *   --help
 *
 * Env fallback if flags omitted: LOCATION_ID, ID_INSTANCE (or INSTANCE_ID)
 */

import axios from "axios";
import { prisma } from "../lib/prisma";
import { getToken } from "../lib/token";
import { getInstanceStatus, getContacts } from "../lib/greenapi";
import {
    setupCustomFields,
    upsertContact,
    searchContactByPhone,
    searchConversation,
    createConversation,
    ContactData,
} from "../lib/ghl";

const APP_ID = process.env.GHL_APP_ID!;

function parseArgs() {
    const args = process.argv.slice(2);
    let locationId = process.env.LOCATION_ID || "";
    let idInstance = process.env.ID_INSTANCE || process.env.INSTANCE_ID || "";
    let probeGhl = false;

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--help" || a === "-h") {
            console.log(`
Usage:
  npx tsx script/debug-sync-contacts.ts --locationId <locationId> --idInstance <idInstance>

Options:
  --probe-ghl   setupCustomFields + upsert + searchConversation/createConversation (writes to GHL)
  --help        Show this message

Environment (optional if you pass flags):
  LOCATION_ID, ID_INSTANCE or INSTANCE_ID
`);
            process.exit(0);
        }
        if (a === "--locationId" && args[i + 1]) locationId = args[++i];
        else if (a === "--idInstance" && args[i + 1]) idInstance = args[++i];
        else if (a === "--probe-ghl") probeGhl = true;
    }

    return { locationId, idInstance, probeGhl };
}

function mask(s: string, keep = 4) {
    if (!s || s.length <= keep * 2) return "(short)";
    return `${s.slice(0, keep)}…${s.slice(-keep)}`;
}

function section(title: string) {
    console.log("\n--- " + title + " ---");
}

async function fetchContactsRaw(
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string
) {
    const baseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/getContacts/${apiTokenInstance}`;
    try {
        const res = await axios.get(url, { validateStatus: () => true });
        return {
            url: url.replace(apiTokenInstance, mask(apiTokenInstance)),
            status: res.status,
            data: res.data,
        };
    } catch (e: unknown) {
        const err = e as { message?: string; response?: { status?: number; data?: unknown } };
        return {
            url: url.replace(apiTokenInstance, mask(apiTokenInstance)),
            status: err.response?.status ?? 0,
            data: err.response?.data,
            error: err.message,
        };
    }
}

async function main() {
    const { locationId, idInstance, probeGhl } = parseArgs();

    if (!locationId || !idInstance) {
        console.error("Missing --locationId and/or --idInstance (or LOCATION_ID / ID_INSTANCE).");
        process.exit(1);
    }

    if (!APP_ID) {
        console.error("GHL_APP_ID is not set in the environment.");
        process.exit(1);
    }

    section("1. Database: WhatsApp instance");
    const byBoth = await prisma.whatsappInstance.findFirst({
        where: { locationId, idInstance: idInstance.toString() },
    });

    if (byBoth) {
        console.log("OK: Row found for locationId + idInstance.");
        console.log({
            id: byBoth.id,
            locationId: byBoth.locationId,
            userId: byBoth.userId,
            idInstance: byBoth.idInstance,
            apiUrl: byBoth.apiUrl,
            apiTokenInstance: mask(byBoth.apiTokenInstance),
            name: byBoth.name,
        });
    } else {
        const byInstance = await prisma.whatsappInstance.findUnique({
            where: { idInstance: idInstance.toString() },
        });
        if (byInstance) {
            console.error(
                "FAIL: idInstance exists but locationId does not match.",
                { expected: locationId, actual: byInstance.locationId }
            );
            process.exit(1);
        }
        console.error("FAIL: No WhatsappInstance for this locationId + idInstance.");
        process.exit(1);
    }

    const instance = byBoth;

    section("2. Green API: instance state");
    const state = await getInstanceStatus(instance.apiUrl, instance.idInstance, instance.apiTokenInstance);
    console.log("getStateInstance response:", state ?? "(null — request failed; check apiUrl / token / network)");

    section("3. Green API: getContacts (raw HTTP)");
    const raw = await fetchContactsRaw(instance.apiUrl, instance.idInstance, instance.apiTokenInstance);
    console.log("Request URL (token masked):", raw.url);
    console.log("HTTP status:", raw.status);
    if (raw.error) console.log("Axios error:", raw.error);

    const body = raw.data;
    const isArray = Array.isArray(body);
    console.log("Response is array:", isArray);
    if (isArray) {
        console.log("Contact count:", body.length);
        if (body.length > 0) {
            console.log("Sample [0] keys:", Object.keys(body[0] || {}));
            console.log("Sample [0]:", JSON.stringify(body[0], null, 2).slice(0, 500) + (JSON.stringify(body[0]).length > 500 ? "…" : ""));
        }
    } else {
        console.log("Body (non-array — sync route treats this as failure):", JSON.stringify(body, null, 2).slice(0, 2000));
    }

    section("4. Green API: getContacts (lib — errors become [])");
    const viaLib = await getContacts(instance.apiUrl, instance.idInstance, instance.apiTokenInstance);
    console.log("Lib returned array length:", Array.isArray(viaLib) ? viaLib.length : "not array");

    if (raw.status !== 200 || !isArray) {
        console.error(
            "\nLikely root cause: Green API getContacts is not returning HTTP 200 + JSON array. Fix apiUrl, idInstance, apiTokenInstance, or instance authorization before debugging GHL."
        );
        await prisma.$disconnect();
        process.exit(1);
    }

    section("5. GHL: location token (getToken)");
    const tokenRecord = await getToken(locationId, APP_ID);
    if (!tokenRecord || ("success" in tokenRecord && !tokenRecord.success)) {
        console.error("FAIL: getToken — no row, refresh failed, or probe call failed.", tokenRecord);
        await prisma.$disconnect();
        process.exit(1);
    }
    const accessToken = (tokenRecord as { accessToken: string }).accessToken;
    console.log("OK: access token present.", mask(accessToken, 6));

    if (!probeGhl) {
        console.log(
            "\nDone (read-only). To test one GHL upsert like the worker, run again with --probe-ghl."
        );
        await prisma.$disconnect();
        process.exit(0);
    }

    section("6. GHL: probe upsert + conversation (first personal contact)");
    const ghlAuth = {
        locationId,
        access_token: accessToken,
        userId: instance.userId,
    };

    let instanceFieldId = "";
    let groupFieldId = "";
    try {
        const fields = await setupCustomFields(
            locationId,
            [{ key: "Instance ID" }, { key: "Group ID" }],
            accessToken
        );
        const iField = fields.find((f) => f.name === "Instance ID" || f.fieldKey === "contact.instance_id");
        if (iField) instanceFieldId = iField.id;
        const gField = fields.find((f) => f.name === "Group ID" || f.fieldKey === "contact.group_id");
        if (gField) groupFieldId = gField.id;
        console.log("Custom fields: Instance ID field:", instanceFieldId || "(none)", "Group ID field:", groupFieldId || "(none)");
    } catch (e) {
        console.error("setupCustomFields error:", e);
    }

    const safeName = (instance.name || "user").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
    const tag = `${safeName}_wp_contact`;

    const firstPersonal = (body as { id?: string; type?: string; name?: string; contactName?: string }[]).find(
        (c) => c && c.type !== "group" && c.id
    );

    if (!firstPersonal?.id) {
        console.error("No personal contact with id in list; cannot probe upsert.");
        await prisma.$disconnect();
        process.exit(1);
    }

    const rawPhone = firstPersonal.id.replace("@c.us", "");
    const displayPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
    const contactPayload: ContactData = { tags: [tag] };
    const customFields: { id: string; field_value: string }[] = [];
    if (instanceFieldId) {
        customFields.push({ id: instanceFieldId, field_value: instance.idInstance });
    }

    let firstName: string | undefined;
    let lastName: string | undefined;
    try {
        const searchRes = await searchContactByPhone(ghlAuth, { phone: displayPhone } as ContactData);
        if (searchRes.success && searchRes.data) {
            const existing = searchRes.data as Record<string, string | undefined>;
            firstName = existing.firstName || existing.first_name || existing.name;
            lastName = existing.lastName || existing.last_name;
        }
    } catch (err) {
        console.error("searchContactByPhone:", (err as Error).message);
    }

    const genericNames = ["", "unknown", "unknown user", "whatsapp"];
    if (!firstName) {
        const fullName = (firstPersonal.name || firstPersonal.contactName || "").trim();
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
    if (customFields.length) contactPayload.customFields = customFields;

    console.log("Upsert payload (summary):", {
        first_name: contactPayload.first_name,
        last_name: contactPayload.last_name,
        phone: contactPayload.phone,
        tags: contactPayload.tags,
        customFieldCount: customFields.length,
    });

    const upsertRes = await upsertContact(ghlAuth, contactPayload);
    console.log("upsertContact:", upsertRes.success ? "OK" : "FAIL", upsertRes.status);
    if (!upsertRes.success) {
        console.log("Details:", upsertRes.data);
        await prisma.$disconnect();
        process.exit(1);
    }

    const newContactId = (upsertRes.data as { id?: string })?.id;
    console.log("contact id:", newContactId);
    if (!newContactId) {
        console.error("Upsert succeeded but no contact id in response.");
        await prisma.$disconnect();
        process.exit(1);
    }

    section("7. GHL: conversation (matches sync-contacts / worker)");
    const searchRes = await searchConversation(ghlAuth, newContactId, 1);
    let conversationId = "";
    if (searchRes.success && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
        conversationId = searchRes.data[0].id;
        console.log("searchConversation: found existing", conversationId);
    } else {
        const createRes = await createConversation(ghlAuth, newContactId);
        if (createRes.success && createRes.data) {
            conversationId = createRes.data.id;
            console.log("createConversation: OK", conversationId);
        } else {
            console.error("createConversation: FAIL", createRes.status, createRes.data);
            await prisma.$disconnect();
            process.exit(1);
        }
    }

    console.log(
        "\nMessage history is not pulled in this script. Production enqueues BullMQ job `sync-history` with chatId, contactId, conversationId — run `npm run worker` with Redis for that."
    );

    await prisma.$disconnect();
    process.exit(0);
}

main().catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
});
