/* eslint-disable */

import axios from "axios";
/* eslint-disable */

import { prisma } from "../../../lib/prisma";
import { NextResponse } from "next/server";
import { getLocationAccessToken } from "../../../lib/token";

export async function POST(req: Request) {
    try {
        const data = await req.json();

        const {
            appId,
            access_token,
            refresh_token,
            userType,
            companyId,
            locationId,
            userId
        } = data;

        const isAgency = companyId && appId && access_token && userType === "Company";

        if (isAgency) {
            const url = `https://services.leadconnectorhq.com/oauth/installedLocations?companyId=${encodeURIComponent(companyId)}&appId=${encodeURIComponent(appId)}&limit=500&isInstalled=true`;

            const resp = await axios.get(url, {
                headers: {
                    Accept: "application/json",
                    Version: "2021-07-28",
                    Authorization: `Bearer ${access_token}`,
                },
            });

            const locations = resp.data?.locations || resp.data?.installedLocations || resp.data || [];
            const locArray = Array.isArray(locations) ? locations : [locations];

            const results: any[] = [];

            for (const loc of locArray) {
                const locId = loc?.id || loc?.locationId || loc?.location_id || loc?._id;
                if (!locId) continue;

                const tokenRes: any = await getLocationAccessToken(locId, { access_token, company_id: companyId } as any);

                if (!tokenRes || !tokenRes.success) {
                    results.push({ locationId: locId, success: false, error: tokenRes?.data || 'failed to fetch' });
                    continue;
                }

                const locAccessToken = tokenRes.data?.access_token;
                const locRefreshToken = tokenRes.data?.refresh_token;
                const expiresIn = tokenRes.data?.expires_in;

                const tokenRecord = await prisma.token.upsert({
                    where: { locationId_appId: { locationId: locId, appId: appId } },
                    update: {
                        appId,
                        accessToken: locAccessToken,
                        refreshToken: locRefreshToken,
                        userType: locationId !== "" && locationId !== null ? "Location" : "Company",
                        companyId,
                        userId,
                        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : new Date(Date.now() + 23 * 3600 * 1000),
                    },
                    create: {
                        appId,
                        accessToken: locAccessToken,
                        refreshToken: locRefreshToken,
                        userType: locationId !== "" && locationId !== null ? "Location" : "Company",
                        companyId,
                        locationId: locId,
                        userId,
                        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : new Date(Date.now() + 23 * 3600 * 1000),
                    },
                });

                results.push({ locationId: locId, success: true, data: tokenRecord });
            }

            return NextResponse.json({ success: true, results });
        }

        // Fallback: require locationId + access_token (existing behavior)
        if (!locationId || !access_token) {
            return NextResponse.json(
                { error: "Missing required fields: locationId or access_token" },
                { status: 400 }
            );
        }

        const tokenRecord = await prisma.token.upsert({
            where: { locationId_appId: { locationId, appId: appId } },
            update: {
                appId,
                accessToken: access_token,
                refreshToken: refresh_token,
                userType: userType,
                companyId,
                userId,
                expiresAt: new Date(Date.now() + 23 * 3600 * 1000),
            },
            create: {
                appId,
                accessToken: access_token,
                refreshToken: refresh_token,
                userType: userType,
                companyId,
                locationId,
                userId,
                expiresAt: new Date(Date.now() + 23 * 3600 * 1000),
            },
        });

        if (!tokenRecord) {
            throw new Error("Failed to save token record");
        }

        return NextResponse.json({
            success: true,
            message: "Token saved successfully",
            data: tokenRecord,
        });
    } catch (error: any) {
        console.error("Error saving token:", error);
        return NextResponse.json(
            { error: "Failed to save token", details: error.message },
            { status: 500 }
        );
    }
}
