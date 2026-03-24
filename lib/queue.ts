import './env';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

export const webhookQueue = new Queue('webhook-processing', {
    connection: connection as any,
});


export const syncQueue = new Queue('sync-processing', {
    connection: connection as any,
});

export const outboundQueue = new Queue('outbound-processing', {
    connection: connection as any,
});


