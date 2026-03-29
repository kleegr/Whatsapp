import { connection } from "./queue";

const SYNC_PROGRESS_TTL = 3600;

export async function setSyncProgress(
    idInstance: string,
    data: Record<string, string | number | boolean>
) {
    const key = `sync:progress:${idInstance}`;
    const stringData: Record<string, string> = {};
    for (const [k, v] of Object.entries(data)) {
        stringData[k] = String(v);
    }
    await connection.hmset(key, stringData);
    await connection.expire(key, SYNC_PROGRESS_TTL);
}

export async function incrSyncField(idInstance: string, field: string, amount = 1) {
    const key = `sync:progress:${idInstance}`;
    await connection.hincrby(key, field, amount);
}

export async function getSyncProgressHash(
    idInstance: string
): Promise<Record<string, string> | null> {
    const key = `sync:progress:${idInstance}`;
    const raw = await connection.hgetall(key);
    if (!raw || Object.keys(raw).length === 0) return null;
    return raw;
}
