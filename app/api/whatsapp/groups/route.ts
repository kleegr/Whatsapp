import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { getContacts } from '../../../../lib/greenapi';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const locationId = searchParams.get('locationId');

        if (!locationId) {
            return NextResponse.json(
                { success: false, error: 'locationId is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        const instance = await prisma.whatsappInstance.findFirst({
            where: { locationId },
            orderBy: { createdAt: 'desc' },
        });

        if (!instance?.apiUrl || !instance?.idInstance || !instance?.apiTokenInstance) {
            return NextResponse.json(
                { success: false, error: 'No WhatsApp instance found' },
                { status: 404, headers: corsHeaders }
            );
        }

        const contacts = await getContacts(
            instance.apiUrl,
            instance.idInstance.toString(),
            instance.apiTokenInstance,
            { group: true }
        );

        const groups = Array.isArray(contacts)
            ? contacts.filter((c: any) => c?.type === 'group' && c?.id)
            : [];

        const list = groups.map((g: any) => ({
            id: g.id,
            name: g.name || g.contactName || 'Unknown Group',
            type: 'group',
            groupId: g.id,
        }));

        return NextResponse.json(
            { success: true, data: list },
            { headers: corsHeaders }
        );
    } catch (error: any) {
        console.error('Error fetching groups:', error);
        return NextResponse.json(
            { success: false, error: error?.message || 'Internal error' },
            { status: 500, headers: corsHeaders }
        );
    }
}
