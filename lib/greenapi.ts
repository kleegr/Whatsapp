
import axios from "axios";

export const getGroupData = async (apiUrl: string, idInstance: string, apiTokenInstance: string, groupId: string) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/getGroupData/${apiTokenInstance}`;
    const payload = {
        groupId: groupId
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error getting group data:", error.message);
        return null;
    }
};

/** Messages to fetch per chat when syncing history to GHL (`getChatHistory` `count`). */
export const SYNC_CHAT_HISTORY_COUNT = 1000;

/** Normalize Green API getChatHistory body to a message array (docs: top-level array; some proxies may wrap). */
export function normalizeChatHistoryPayload(data: unknown): unknown[] {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") {
        const o = data as Record<string, unknown>;
        if (Array.isArray(o.messages)) return o.messages;
        if (Array.isArray(o.chatHistory)) return o.chatHistory;
    }
    return [];
}

export const getChatHistory = async (
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string,
    chatId: string,
    count: number = 100
): Promise<any[]> => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/getChatHistory/${apiTokenInstance}`;
    const payload = {
        chatId: chatId,
        count: count
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            },
            validateStatus: (s) => s < 500,
        });
        if (response.status >= 400) {
            console.error("getChatHistory HTTP error:", response.status, response.data);
            return [];
        }
        const raw = response.data;
        const list = normalizeChatHistoryPayload(raw);
        if (list.length === 0 && raw != null && !Array.isArray(raw)) {
            console.warn(
                "getChatHistory: response was not a message array. chatId=%s keys=%s",
                chatId,
                typeof raw === "object" && raw ? Object.keys(raw as object).join(",") : typeof raw
            );
        }
        return list;
    } catch (error: any) {
        console.error("Error getting chat history:", error.message, error.response?.data ?? "");
        return [];
    }
};

export const sendMessageToGroup = async (apiUrl: string, idInstance: string, apiTokenInstance: string, groupId: string, message: string) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
    const payload = {
        chatId: groupId,
        message: message,
        customPreview: {} // As per user snippet
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error sending message to group:", error.message);
        throw error;
    }
}


export const createGreenApiInstance = async (webhookToken: string, payload: any) => {
    const url = `https://api.green-api.com/partner/createInstance/${webhookToken}`;

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error creating GreenAPI instance:", error.message);
    }
};

export const deleteGreenApiInstance = async (webhookToken: string, idInstance: string) => {
    const url = `https://api.green-api.com/partner/deleteInstanceAccount/${webhookToken}`;
    const payload = {
        idInstance: idInstance
    };

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error deleting GreenAPI instance:", error.message);
        throw error;
    }
};

export const getInstanceStatus = async (apiUrl: string, idInstance: string, apiTokenInstance: string) => {
    // Ensure apiUrl doesn't represent a double slash issue if one exists, though usually apiUrl comes clean.
    // The pattern requested is {{apiUrl}}/waInstance{{idInstance}}/getStateInstance/{{apiTokenInstance}}
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/getStateInstance/${apiTokenInstance}`;

    console.log("status_url", url);
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error: any) {
        console.error("Error getting instance status:", error.message);
        return null;
    }
};

export const logoutInstance = async (apiUrl: string, idInstance: string, apiTokenInstance: string) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/logout/${apiTokenInstance}`;

    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error: any) {
        console.error("Error logging out instance:", error.message);
        throw error;
    }
};

export const getContacts = async (
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string,
    options?: { group?: boolean; count?: number }
) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    let url = `${baseUrl}waInstance${idInstance}/getContacts/${apiTokenInstance}`;
    const params = new URLSearchParams();
    if (options?.group === true) params.set('group', 'true');
    if (options?.group === false) params.set('group', 'false');
    if (options?.count != null) params.set('count', String(options.count));
    if (params.toString()) url += '?' + params.toString();

    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error: any) {
        console.error("Error getting contacts:", error.message);
        return [];
    }
};

function ensureChatIdFormat(chatId: string): string {
    if (!chatId || typeof chatId !== 'string') return chatId;
    if (chatId.includes('@')) return chatId;
    return chatId + '@c.us';
}

export const forwardMessages = async (
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string,
    chatIdFrom: string,
    chatId: string,
    messages: string[]
) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/forwardMessages/${apiTokenInstance}`;
    const payload = {
        chatId: ensureChatIdFormat(chatId),
        chatIdFrom: ensureChatIdFormat(chatIdFrom),
        messages,
    };
    console.log("forward_payload", payload);
    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error forwarding messages:", error.message);
        throw error;
    }
};

/**
 * Fetch a single message by id (e.g. to get quoted message text for stanzaId).
 * POST waInstance{id}/getMessage/{token} with body { chatId, idMessage }.
 */
export const getMessage = async (
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string,
    chatId: string,
    idMessage: string
): Promise<any> => {
    const baseUrl = apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/getMessage/${apiTokenInstance}`;
    const payload = {
        chatId: chatId.includes("@") ? chatId : `${chatId}@c.us`,
        idMessage,
    };
    try {
        const response = await axios.post(url, payload, {
            headers: { "Content-Type": "application/json" },
        });
        return response.data;
    } catch (error: any) {
        console.error("Error getMessage:", error.message);
        return null;
    }
};

export const sendMessage = async (
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string,
    chatId: string,
    message: string,
    quotedMessageId?: string
) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/sendMessage/${apiTokenInstance}`;
    const payload: any = {
        chatId: ensureChatIdFormat(chatId),
        message,
    };

    if (quotedMessageId) {
        payload.quotedMessageId = quotedMessageId;
    }


    console.log("payload", payload)

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error sending message:", error.message);
        throw error;
    }
};

export const sendFileByUrl = async (
    apiUrl: string,
    idInstance: string,
    apiTokenInstance: string,
    chatId: string,
    fileUrl: string,
    fileName: string,
    caption?: string,
    quotedMessageId?: string
) => {
    const baseUrl = apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`;
    const url = `${baseUrl}waInstance${idInstance}/sendFileByUrl/${apiTokenInstance}`;
    const payload: any = {
        chatId: ensureChatIdFormat(chatId),
        urlFile: fileUrl,
        fileName: fileName,
        caption: caption,
    };

    if (quotedMessageId) {
        payload.quotedMessageId = quotedMessageId;
    }

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return response.data;
    } catch (error: any) {
        console.error("Error sending file by URL:", error.message);
        throw error;
    }
};
