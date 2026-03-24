"use client"
/* eslint-disable */

import { useEffect, useState } from 'react';
import crypto from 'crypto-js';

const SsoHandler = () => {
    const [ssodata, setssodata] = useState('');

    const decript_data = async (payload: any, app: any) => {
        let ciphertext = await crypto.AES.decrypt(payload, app.key).toString(crypto.enc.Utf8);
        console.log(ciphertext);
        setssodata(ciphertext);
    };
    const checkSSO = (sso: any) => {
        const key = new Promise((resolve) => {

            window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*');
            const temp = window.addEventListener('message', ({ data }) => {
                if (true) {
                    console.log(data.payload, sso, 'sso');
                    decript_data(data.payload, sso);
                } else {
                }
            });
        });
    };
    return {
        SSO: ssodata,
        checkSSO: checkSSO,
    };
};
export default SsoHandler;
