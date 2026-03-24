
import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const ghlMsgId = searchParams.get('ghlMsgId');

        if (!ghlMsgId) {
            return NextResponse.json(
                { success: false, error: 'ghlMsgId query parameter is required' },
                { status: 400, headers: corsHeaders }
            );
        }

        const messageMap = await prisma.whatsappMessageMap.findFirst({
            where: {
                ghlMsgId: ghlMsgId
            }
        });

        if (!messageMap) {
            return NextResponse.json(
                { success: false, error: 'Message mapping not found' },
                { status: 404, headers: corsHeaders }
            );
        }

        return NextResponse.json(
            {
                success: true,
                data: messageMap,
            },
            { headers: corsHeaders }
        );

    } catch (error: any) {
        console.error("Error fetching whatsapp message map:", error);
        return NextResponse.json(
            { success: false, error: 'Internal Server Error', details: error.message },
            { status: 500, headers: corsHeaders }
        );
    }
}
