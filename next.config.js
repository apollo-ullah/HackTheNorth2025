/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        VAPI_API_KEY: process.env.VAPI_API_KEY,
        VAPI_ASSISTANT_ID: process.env.VAPI_ASSISTANT_ID,
        VAPI_PHONE_NUMBER_ID: process.env.VAPI_PHONE_NUMBER_ID,
    },
}

module.exports = nextConfig
