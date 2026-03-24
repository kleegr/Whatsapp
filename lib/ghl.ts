import axios from "axios";
import FormData from "form-data";
/* eslint-disable */

/* -------------------------------------------------------------------------- */
/*                                  TYPES                                     */
/* -------------------------------------------------------------------------- */


export interface GHLAuth {
    access_token: string;
    locationId: string;
    userId?: string;
}

export interface ContactData {
    phone?: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    contactId?: string;
    message?: string;
    conversationId?: string;
    attachments?: string[];
    tags?: string[];
    customFields?: CustomFieldsData[];
    status?: string;
    userId?: string;
    messageType?: string;
    subject?: string;
    html?: string;
    emailFrom?: string;
    emailTo?: string;
    emailCc?: string[];
    emailBcc?: string[];
    replyMessageId?: string;
    templateId?: string;
    scheduledTimestamp?: number;
    emailReplyMode?: string;
    threadId?: string;
}

export interface SubaccountData {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    [key: string]: any;
}

export interface UserData {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
    email: string;
    [key: string]: any;
}

export interface CustomFieldsData {
    id: any;
    name?: string;
    fieldKey?: string;
    field_value: string;
}

export interface updateContactData {
    contactId: string;
    customFields: CustomFieldsData[];
}

export interface ApiResponse<T> {
    success: boolean;
    status: number;
    data: T | string | null;
}
/* -------------------------------------------------------------------------- */
/*                         SEARCH CONTACTs                          */
/* -------------------------------------------------------------------------- */

export const searchContacts = async (
    ghl: GHLAuth,
    query?: string,
    searchAfter?: string[]
): Promise<ApiResponse<any>> => {
    const searchData: any = {
        locationId: ghl.locationId,
        pageLimit: 20
    };

    if (searchAfter) {
        searchData.searchAfter = searchAfter;
    }

    if (query) {
        searchData.query = query;
    }

    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/contacts/search",
            searchData,
            {
                headers: {
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                    Accept: "application/json",
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data?.contacts || [],
        };
    } catch (error: any) {
        console.error("searchContactByPhone error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};
/* -------------------------------------------------------------------------- */
/*                         SEARCH CONTACT BY PHONE                            */
/* -------------------------------------------------------------------------- */

export const searchContactByPhone = async (
    ghl: GHLAuth,
    data: ContactData
): Promise<ApiResponse<any>> => {
    const searchData = {
        locationId: ghl.locationId,
        pageLimit: 100,
        filters: [
            {
                group: "AND",
                filters: [
                    {
                        field: "phone",
                        operator: "eq",
                        value: data.phone,
                    },
                ],
            },
        ],
    };

    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/contacts/search",
            searchData,
            {
                headers: {
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                    Accept: "application/json",
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data?.contacts?.[0] || null,
        };
    } catch (error: any) {
        console.error("searchContactByPhone error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                              UPSERT CONTACT                                */
/* -------------------------------------------------------------------------- */

export const upsertContact = async (
    ghl: GHLAuth,
    data: ContactData,
): Promise<ApiResponse<any>> => {
    const contactData = {
        firstName: data.first_name || "",
        lastName: data.last_name || "",
        name: `${data.first_name || ""} ${data.last_name || ""}`.trim(),
        email: data.email,
        locationId: ghl.locationId,
        phone: data.phone,
        tags: data.tags,
        customFields: data.customFields
    };

    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/contacts/upsert",
            contactData,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data?.contact || null,
        };
    } catch (error: any) {
        console.error("upsertContact error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                              UPDATE CONTACT                                */
/* -------------------------------------------------------------------------- */

export const updateContact = async (
    ghl: GHLAuth,
    data: updateContactData
): Promise<ApiResponse<any>> => {
    try {
        const result = await axios.put(
            `https://services.leadconnectorhq.com/contacts/${data.contactId}`,
            { customFields: data?.customFields },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data?.contact || null,
        };
    } catch (error: any) {
        console.error("updateContact error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};


/* -------------------------------------------------------------------------- */
/*                         ADD INBOUND MESSAGE                                */
/* -------------------------------------------------------------------------- */

export const addInboundMessage = async (
    ghl: GHLAuth,
    data: ContactData
): Promise<ApiResponse<any>> => {
    const messageData = {
        type: "Custom",
        contactId: data.contactId,
        attachments: data.attachments,
        conversationProviderId: process.env.NEXT_PUBLIC_CONVERSATION_PROVIDER_ID!,

    };

    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/conversations/messages/inbound",
            messageData,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("addInboundMessage error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                         ADD MESSAGE TO CONVERSATION                        */
/* -------------------------------------------------------------------------- */

export const addMessageToConversation = async (
    ghl: GHLAuth,
    data: ContactData
): Promise<ApiResponse<any>> => {
    const messageData = {
        type: "Custom",
        contactId: data.contactId,
        message: data.message,
        ...(data.attachments && { attachments: data.attachments }),
        conversationId: data.conversationId,
        conversationProviderId: process.env.NEXT_PUBLIC_CONVERSATION_PROVIDER_ID!,
        ...(data.replyMessageId && { replyMessageId: data.replyMessageId }),
        ...(data.threadId && { threadId: data.threadId }),
    };

    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/conversations/messages/inbound",
            messageData,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("addMessageToConversation error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                           SENT OUTBOUND MESSAGE                            */
/* -------------------------------------------------------------------------- */

export const sentOutboundMessage = async (
    ghl: GHLAuth,
    data: ContactData
): Promise<ApiResponse<any>> => {
    const messageData = {
        type: data.messageType || "Custom",
        contactId: data.contactId,
        ...(data.message && { message: data.message }),
        ...(data.attachments && { attachments: data.attachments }),
        conversationProviderId: process.env.NEXT_PUBLIC_CONVERSATION_PROVIDER_ID!,
        direction: "outbound",
        ...(data.status && { status: data.status }),
        ...(data.userId && { userId: data.userId }),
        ...(data.conversationId && { conversationId: data.conversationId }),
        ...(data.subject && { subject: data.subject }),
        ...(data.html && { html: data.html }),
        ...(data.emailFrom && { emailFrom: data.emailFrom }),
        ...(data.emailTo && { emailTo: data.emailTo }),
        ...(data.emailCc && { emailCc: data.emailCc }),
        ...(data.emailBcc && { emailBcc: data.emailBcc }),
        ...(data.replyMessageId && { replyMessageId: data.replyMessageId }),
        ...(data.templateId && { templateId: data.templateId }),
        ...(data.scheduledTimestamp && { scheduledTimestamp: data.scheduledTimestamp }),
        ...(data.emailReplyMode && { emailReplyMode: data.emailReplyMode }),
        ...(data.threadId && { threadId: data.threadId })
    };


    console.log("email_outbounf_message_data", messageData);

    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/conversations/messages",
            messageData,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-04-15",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("sentOutboundMessage error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                  TICKET CUSTOM OBJECT RECORDS & ASSOCIATIONS               */
/* -------------------------------------------------------------------------- */

export interface TicketRecordProps {
    [key: string]: any;
}

export const createTicketRecord = async (
    ghl: GHLAuth,
    properties: TicketRecordProps
): Promise<ApiResponse<any>> => {
    const body = {
        locationId: ghl.locationId,
        properties,
    };
    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/objects/custom_objects.tickets/records",
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );
        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("createTicketRecord error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

export const updateTicketRecord = async (
    ghl: GHLAuth,
    recordId: string,
    properties: TicketRecordProps
): Promise<ApiResponse<any>> => {
    try {
        const result = await axios.put(
            `https://services.leadconnectorhq.com/objects/custom_objects.tickets/records/${recordId}?locationId=${encodeURIComponent(ghl.locationId)}`,
            properties,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );
        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("updateTicketRecord error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

export const searchTicketRecords = async (
    ghl: GHLAuth,
    body: any
): Promise<ApiResponse<any>> => {
    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/objects/custom_objects.tickets/records/search",
            {
                locationId: ghl.locationId,
                ...body,
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );
        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("searchTicketRecords error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

export const getTicketAssociation = async (
    ghl: GHLAuth
): Promise<ApiResponse<any>> => {
    try {
        const result = await axios.get(
            "https://services.leadconnectorhq.com/associations/objectKey/custom_objects.tickets",
            {
                params: { locationId: ghl.locationId },
                headers: {
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );
        const data = result.data ?? null;
        return {
            success: true,
            status: 200,
            data,
        };
    } catch (error: any) {
        console.error("getTicketAssociation error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

export const createTicketRelation = async (
    ghl: GHLAuth,
    associationId: string,
    contactId: string,
    ticketRecordId: string
): Promise<ApiResponse<any>> => {
    const body = {
        locationId: ghl.locationId,
        add: [
            {
                associationId,
                firstRecordId: contactId,
                secondRecordId: ticketRecordId,
            },
        ],
    };
    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/associations/relations/bulk",
            body,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );
        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("createTicketRelation error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                     SEND INTERNAL COMMENT (HighLevel)                     */
/* -------------------------------------------------------------------------- */

export interface InternalCommentPayload {
    contactId: string;
    message: string;
    userId: string;
    mentions?: string[];
}

export const sendInternalComment = async (
    ghl: GHLAuth,
    data: InternalCommentPayload
): Promise<ApiResponse<any>> => {
    const payload = {
        type: "InternalComment",
        contactId: data.contactId,
        message: data.message,
        userId: data.userId,
        ...(data.mentions && data.mentions.length > 0 && { mentions: data.mentions }),
    };
    try {
        const result = await axios.post(
            "https://services.leadconnectorhq.com/conversations/messages",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-04-15",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );
        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("sendInternalComment error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                           UPDATE MESSAGE STATUS                            */
/* -------------------------------------------------------------------------- */

export const updateMessageStatus = async (
    ghl: GHLAuth,
    messageId: string
): Promise<ApiResponse<any>> => {
    try {
        const result = await axios.put(
            `https://services.leadconnectorhq.com/conversations/messages/${messageId}/status`,
            { status: "read" },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: result.data || null,
        };
    } catch (error: any) {
        console.error("updateMessageStatus error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};
export const searchConversation = async (
    ghl: GHLAuth,
    contactId: string,
    limit = 100,
) => {
    let config = {
        method: "get",
        maxBodyLength: Infinity,
        url: `https://services.leadconnectorhq.com/conversations/search`,
        params: {
            locationId: ghl?.locationId,
            limit: limit,
            contactId: contactId || "",
        },
        headers: {
            Accept: "application/json",
            Authorization: "Bearer " + ghl?.access_token,
            Version: "2021-04-15",
        },
    };



    try {
        const response = await axios.request(config);
        return {
            success: true,
            status: 200,
            data: response?.data?.conversations || [],
            total: response?.data?.total || 0,
        };
    } catch (error: any) {
        console.error("Error in searchConversation:", error.response ? error.response.data : error.message);
        return {
            success: false,
            status: error.response ? error.response.status : 500,
            data: error.response ? error.response.data : error.message,
            total: 0
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                            GET CONVERSATION                                */
/* -------------------------------------------------------------------------- */

export const getConversation = async (
    ghl: GHLAuth,
    conversationId: string
): Promise<ApiResponse<any>> => {
    try {
        const response = await axios.get(
            `https://services.leadconnectorhq.com/conversations/${conversationId}`,
            {
                headers: {
                    Accept: "application/json",
                    Version: "2021-04-15",
                    Authorization: `Bearer ${ghl.access_token}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data || null,
        };
    } catch (error: any) {
        console.error("getConversation error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};
/* -------------------------------------------------------------------------- */
/*                            CREATE CONVERSATION                             */
/* -------------------------------------------------------------------------- */

export const createConversation = async (
    ghl: GHLAuth,
    contactId: string
): Promise<ApiResponse<any>> => {
    const payload = {
        locationId: ghl.locationId,
        contactId,
        assignedTo: ghl.userId
    };

    try {
        const response = await axios.post(
            "https://services.leadconnectorhq.com/conversations/",
            payload,
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data?.conversation || null,
        };
    } catch (error: any) {
        console.error("createConversation error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

export const setupCustomFields = async (
    location_id: string,
    custom_field_names: Array<{ key: string; field_value?: string }>,
    access_token: string
) => {
    let folderId;

    // CHECK IF FOLDER EXISTS
    const folder_check = await axios.get(
        `https://services.leadconnectorhq.com/locations/${location_id}/customFields/search?documentType=folder&model=contact&query=WhatsApp&includeStandards=true`,
        {
            headers: {
                Authorization: `Bearer ${access_token}`,
                Version: "2021-07-28",
                Accept: "application/json",
            },
        }
    );

    folderId = folder_check?.data?.customFieldFolders?.[0]?._id;

    // IF FOLDER NOT FOUND, CREATE NEW FOLDER
    if (folder_check?.data?.customFieldFolders?.length < 0 || !folderId) {
        const custom_field_folder_options = {
            method: "POST",
            url: `https://services.leadconnectorhq.com/locations/${location_id}/customFields`,
            headers: {
                Authorization: `Bearer ${access_token}`,
                Version: "2021-07-28",
                "Content-Type": "application/json",
                Accept: "application/json",
            },
            data: {
                name: "WhatsApp",
                documentType: "folder",
                model: "contact",
            },
        };

        const custom_field_folder = await axios.request(custom_field_folder_options);
        folderId = custom_field_folder?.data?.customFieldFolder?.id;
    }

    // CREATE CUSTOM FIELDS IN FOLDER
    const custom_fields_created = [];

    for (const field of custom_field_names) {
        const { key, field_value } = field;

        // CHECK IF FIELD ALREADY EXISTS
        const all_fields = await axios.get(
            `https://services.leadconnectorhq.com/locations/${location_id}/customFields/search?parentId=${folderId}&documentType=field&model=all&query=&includeStandards=true`,
            {
                headers: {
                    Authorization: `Bearer ${access_token}`,
                    Version: "2021-07-28",
                    Accept: "application/json",
                },
            }
        );

        const fieldAlreadyExists = all_fields?.data?.customFields?.find(
            (f: { name: string }) => f.name === key
        );

        if (fieldAlreadyExists) {
            custom_fields_created.push({
                id: fieldAlreadyExists._id || fieldAlreadyExists.id,
                name: fieldAlreadyExists.name,
                fieldKey: fieldAlreadyExists.fieldKey,
                field_value: field_value ?? "",
            });
            continue;
        }

        // CREATE THE CUSTOM FIELD
        try {
            const fieldRes = await axios.post(
                `https://services.leadconnectorhq.com/locations/${location_id}/customFields`,
                {
                    name: key,
                    fieldKey: "",
                    dataType: "TEXT",
                    documentType: "field",
                    showInForms: true,
                    model: "contact",
                    parentId: folderId,
                    description: "",
                },
                {
                    headers: {
                        Authorization: `Bearer ${access_token}`,
                        Version: "2021-07-28",
                        "Content-Type": "application/json",
                        Accept: "application/json",
                    },
                }
            );

            custom_fields_created.push({
                id: fieldRes?.data?.customField?.id,
                name: fieldRes?.data?.customField?.name,
                fieldKey: fieldRes?.data?.customField?.fieldKey,
                field_value: field_value ?? "",
            });
        } catch (error: any) {
            console.error(`Error creating field ${key}: ${error.response?.data || error.message}`);
            continue;
        }
    }

    return custom_fields_created.map((field) => ({
        id: field.id,
        name: field.name,
        fieldKey: field.fieldKey,
        field_value: String(field.field_value ?? ""),
    }));
}

export async function getCustomFields(locationId: string, accessToken: string) {
    try {
        const res = await axios.get(
            `https://services.leadconnectorhq.com/locations/${locationId}/customFields`,
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    Version: "2021-07-28",
                },
            }
        );

        return res.data.customFields || [];
    } catch (err: any) {
        console.error("Error fetching custom fields:", err.message);
        return [];
    }
}

export async function getAccountIdField(ghl: GHLAuth, contactId: string) {
    try {
        const contactRes = await axios.get(
            `https://services.leadconnectorhq.com/contacts/${contactId}`,
            {
                headers: {
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                },
            }
        );

        const contact = contactRes.data?.contact;
        const contactFields = contact?.customFields || [];

        if (!contactFields.length) return null;

        const locationFields = await getCustomFields(
            ghl.locationId,
            ghl.access_token
        );

        const accountField = locationFields.find(
            (f: any) => f.name === "Group ID"
        );

        if (!accountField) return null;

        const matchedField = contactFields.find(
            (cf: any) => cf.id === accountField.id
        );

        return matchedField?.value || null;
    } catch (err: any) {
        console.error("Error fetching Account ID field:", err.message);
        return null;
    }


}

export const getCustomFieldValue = async (ghl: GHLAuth, contactId: string, fieldName: string) => {

    try {
        const contactRes = await axios.get(
            `https://services.leadconnectorhq.com/contacts/${contactId}`,
            {
                headers: {
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                },
            }
        );

        const contact = contactRes.data?.contact;
        const contactFields = contact?.customFields || [];

        if (!contactFields.length) return null;

        const locationFields = await getCustomFields(
            ghl.locationId,
            ghl.access_token
        );
        const targetField = locationFields.find(
            (f: any) => f.name === fieldName
        );

        if (!targetField) return null;

        const matchedField = contactFields.find(
            (cf: any) => cf.id === targetField.id
        );

        return matchedField?.value || null;
    } catch (err: any) {
        console.error(`Error fetching ${fieldName} field:`, err.message);
        return null;
    }
}

export const getContactById = async (ghl: GHLAuth, contactId: string): Promise<ApiResponse<any>> => {
    try {
        const response = await axios.get(
            `https://services.leadconnectorhq.com/contacts/${contactId}`,
            {
                headers: {
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                    Accept: "application/json",
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data?.contact || null,
        };
    } catch (error: any) {
        console.error("getContactById error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};



/* -------------------------------------------------------------------------- */
/*                        UPLOAD FILE TO MEDIA LIBRARY                        */
/* -------------------------------------------------------------------------- */




/* -------------------------------------------------------------------------- */
/*                            GET SUBACCOUNT (LOCATION)                       */
/* -------------------------------------------------------------------------- */

export const getSubaccount = async (
    accessToken: string,
    locationId: string
): Promise<ApiResponse<SubaccountData>> => {
    try {
        const response = await axios.get(
            `https://services.leadconnectorhq.com/locations/${locationId}`,
            {
                headers: {
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data?.location || null,
        };
    } catch (error: any) {
        console.error("getSubaccount error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};
/* -------------------------------------------------------------------------- */
/*                            GET SUBACCOUNT USER                           */
/* -------------------------------------------------------------------------- */

export const getSubaccountUser = async (
    accessToken: string,
    userId: string
): Promise<ApiResponse<UserData>> => {
    try {
        const response = await axios.get(
            `https://services.leadconnectorhq.com/users/${userId}`,
            {
                headers: {
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data || null,
        };
    } catch (error: any) {
        console.error("getSubaccountUser error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                            GET SUBACCOUNT USERS                            */
/* -------------------------------------------------------------------------- */

export const getSubaccountUsers = async (
    accessToken: string,
    locationId: string
): Promise<ApiResponse<UserData[]>> => {
    try {
        const response = await axios.get(
            `https://services.leadconnectorhq.com/users/?locationId=${locationId}`,
            {
                headers: {
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data?.users || [],
        };
    } catch (error: any) {
        console.error("getSubaccountUsers error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};

/* -------------------------------------------------------------------------- */
/*                                  UPLOAD FILE                               */
/* -------------------------------------------------------------------------- */
export const uploadFileToMediaLibrary = async (
    ghl: GHLAuth,
    fileUrl: string,
    data: Buffer,
    filename: string,
    contentType: string,
): Promise<ApiResponse<any>> => {

    try {
        const form = new FormData();
        if (data) {

            form.append("file", data, { filename: filename, contentType: contentType });
        } else {
            form.append("hosted", true);
            form.append("fileUrl", fileUrl);
        }

        const response = await axios.post(
            "https://services.leadconnectorhq.com/medias/upload-file",
            form,
            {
                headers: {
                    Authorization: `Bearer ${ghl.access_token}`,
                    Version: "2021-07-28",
                    ...form.getHeaders(),
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data
        };

    } catch (error: any) {
        console.error("uploadFileToMediaLibrary error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};


/* -------------------------------------------------------------------------- */
/*                                  GET USER                                  */
/* -------------------------------------------------------------------------- */

export const getUserInfo = async (
    authToken: string,
    userId: string
): Promise<ApiResponse<UserData>> => {
    try {
        const response = await axios.get(
            `https://services.leadconnectorhq.com/users/${userId}`,
            {
                headers: {
                    Authorization: `Bearer ${authToken}`,
                    Version: "2021-07-28",
                    Accept: "application/json",
                },
            }
        );

        return {
            success: true,
            status: 200,
            data: response.data,
        };
    } catch (error: any) {
        console.error("getUserInfo error:", error.response?.data || error.message);
        return {
            success: false,
            status: error.response?.status || 500,
            data: error.response?.data || error.message,
        };
    }
};
