/** @type {import('next').NextConfig} */
const nextConfig = {
    env: {
        VAPI_FRONTEND_KEY: process.env.VAPI_FRONTEND_KEY,
    },
}

module.exports = nextConfig
