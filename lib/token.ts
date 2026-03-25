/* eslint-disable */
import axios from "axios";
import qs from "qs";
import { prisma } from "./prisma";
import { searchContacts } from "./ghl";

const APP_ID = process.env.GHL_APP_ID!;
const CLIENT_ID = process.env.GHL_CLIENT_ID!;
const CLIENT_SECRET = process.env.GHL_CLIENT_SECRET!;

interface GHLAuth {
  access_token: string;
  refresh_token: string;
  locationId?: string;
  company_id?: string;
}


interface RefreshKeys {
  client_id: string;
  client_secret: string;
}

interface RefreshData {
  refresh_token?: string;
}

export const getRefreshAgencyToken = async (data: RefreshData, keys: RefreshKeys) => {
  const options = {
    method: "POST",
    url: "https://services.leadconnectorhq.com/oauth/token",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    data: qs.stringify({
      client_id: keys?.client_id,
      client_secret: keys?.client_secret,
      grant_type: "refresh_token",
      refresh_token: data?.refresh_token,
    }),
  };

  const result = await axios
    .request(options)
    .then(function (response) {
      return { success: true, status: 200, data: response.data };
    })
    .catch(function (error) {
      return { success: false, status: 400, data: error };
    });

  return result;
};

export const getLocationAccessToken = async (locationId: string, ghl: GHLAuth) => {
  const encodedParams = new URLSearchParams();
  if (!ghl?.company_id) {
    throw new Error("Missing company_id in GHLAuth");
  }
  encodedParams.set("companyId", ghl.company_id);
  encodedParams.set("locationId", locationId);
  const options = {
    method: "POST",
    url: "https://services.leadconnectorhq.com/oauth/locationToken",
    headers: {
      Version: "2021-07-28",
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      Authorization: `Bearer ${ghl?.access_token}`,
    },
    data: encodedParams,
  };

  const token = await axios
    .request(options)
    .then(function (response) {
      return { status: 200, success: true, data: response.data };
    })
    .catch(function (error) {
      console.error(error.response ? error.response.data : error.message);
      return {
        success: false,
        status: error.response ? error.response.status : 500,
        data: error.response ? error.response.data : error.message,
      };
    });

  return token;
};

const decodeJWT = (token: string) => {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error("Invalid token:", error);
    return null;
  }
};

export const getToken = async (locationId: string, appId?: string) => {
  const effectiveAppId = appId || APP_ID;
  const client_id = CLIENT_ID;
  const client_secret = CLIENT_SECRET;

  const tokenRecord = await prisma.token.findFirst({
    where: { locationId, appId: effectiveAppId },
  });

  if (!tokenRecord) return null;

  const search_contacts = await searchContacts({
    locationId,
    access_token: tokenRecord.accessToken!,
  });

  if (search_contacts.success) {
    return tokenRecord;
  }

  console.log("Location token invalid -- attempting refresh...");

  const refreshResult = await getRefreshAgencyToken(
    { refresh_token: tokenRecord.refreshToken! },
    { client_id, client_secret }
  );

  if (!refreshResult.success) {
    console.error("Failed to refresh location token:", refreshResult.data);
    return { success: false, message: "Invalid Refresh Token" };
  }

  const updatedToken = await prisma.token.update({
    where: { id: tokenRecord.id },
    data: {
      accessToken: refreshResult.data.access_token,
      refreshToken: refreshResult.data.refresh_token,
      expiresAt: new Date(Date.now() + refreshResult.data.expires_in * 1000),
    },
  });

  return updatedToken;
};
