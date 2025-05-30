/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: 'https',
                hostname: 'res.cloudinary.com',
                port: '',
                pathname: '**',
            },
        ],
    },
    experimental: {
        // serverActions: true, // This line might be present in older Next.js versions, bodySizeLimit is nested now.
    },
    serverActions: {
        bodySizeLimit: '10mb',
    },
};

module.exports = nextConfig; 