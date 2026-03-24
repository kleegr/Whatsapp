"use client";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import qs from "qs";

const Index = () => {
    const [message, setMessage] = useState("Installation in Progress...");
    const [loading, setLoading] = useState(true);
    const hasRun = useRef(false);
    const app_id = process.env.NEXT_PUBLIC_APP_ID!;

    console.log("app_id", app_id)

    const SaveAppToken = async () => {
        try {
            const searchParams = new URLSearchParams(window.location.search);
            const code = searchParams.get("code");

            if (!code) {
                setMessage("No authorization code found.");
                setLoading(false);
                return;
            }

            // Step 1: Request Access Token
            const data = qs.stringify({
                grant_type: "authorization_code",
                client_id: process.env.NEXT_PUBLIC_GHL_CLIENT_ID!,
                client_secret: process.env.NEXT_PUBLIC_GHL_CLIENT_SECRET!,
                code: code,
                refresh_token: "",
            });

            const tokenResponse = await axios.post(
                "https://services.leadconnectorhq.com/oauth/token",
                data,
                {
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Accept: "application/json",
                    },
                }
            );

            const ghlData = tokenResponse?.data;
            if (!ghlData) {
                setMessage("Failed to retrieve tokens from GHL.");
                setLoading(false);
                return;
            }

            // Step 2: Save Token to Your Backend
            const saveResponse = await axios.post("/api/save-token", {
                appId: app_id,
                access_token: ghlData.access_token,
                refresh_token: ghlData.refresh_token,
                userType: ghlData.userType,
                companyId: ghlData.companyId,
                locationId: ghlData.locationId || "",
                userId: ghlData.userId,
                is_bulk_installed: ghlData.isBulkInstallation,
            });

            // Log backend response for debugging
            console.log("save-token response:", saveResponse?.status, saveResponse?.data);

            if (saveResponse.status !== 200 && saveResponse.status !== 201) {
                setMessage("Error while saving the token to DB.");
                setLoading(false);
                return;
            }

            if (!saveResponse?.data?.success && !saveResponse?.data?.results) {
                setMessage("Error while saving the token to DB.");
                setLoading(false);
                return;
            }

            // Step 3: Success
            setLoading(false);
            setMessage("App Installed Successfully!");

        } catch (error) {
            console.error(error);
            setMessage("Installation failed. Check console for details.");
            setLoading(false);
        }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!hasRun.current) {
            hasRun.current = true;
            SaveAppToken();
        }
    }, []);

    return (
        <div className="flex flex-col gap-6 w-full h-[100vh] justify-center items-center text-center bg-gray-50">
            {loading ? (
                <div className="flex flex-col items-center">
                    {/* Spinner */}
                    <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <h1 className="text-2xl font-semibold text-gray-700">{message}</h1>
                </div>
            )
                :
                <h1 className="text-3xl font-bold text-gray-800">{message}</h1>

            }
        </div>
    );
};

export default Index;
