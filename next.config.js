/** @type {import('next').NextConfig} */
const nextConfig = {
    // Remove env config to avoid warnings
    async redirects() {
        return [
            {
                source: '/stacy',
                destination: '/index.html',
                permanent: false,
            },
        ]
    },
}

module.exports = nextConfig
