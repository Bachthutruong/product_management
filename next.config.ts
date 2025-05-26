
import type {NextConfig} from 'next';

const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

const remotePatterns: NextConfig['images']['remotePatterns'] = [
  {
    protocol: 'https',
    hostname: 'placehold.co',
    port: '',
    pathname: '/**',
  },
];

if (cloudName) {
  remotePatterns.push({
    protocol: 'https',
    hostname: 'res.cloudinary.com',
    port: '',
    // Standard Cloudinary path structure: /<cloud_name>/image/upload/...
    // The previous `/${cloudName}/**` should also work, but this is more specific.
    pathname: `/${cloudName}/image/upload/**`,
  });
} else {
  console.warn(
    '\x1b[33m%s\x1b[0m', // Yellow text
    `WARN: NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME environment variable is not set. 
    Cloudinary images may not load correctly in next/image components. 
    Please set this in your .env.local file.`
  );
  // Fallback to a less specific pattern if you absolutely need images to load,
  // but it's better to fix the env var. This is generally not recommended for production.
  /*
  remotePatterns.push({
    protocol: 'https',
    hostname: 'res.cloudinary.com',
    port: '',
    pathname: '/**', // Less specific, allows any path on res.cloudinary.com
  });
  */
}


const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: remotePatterns,
  },
};

export default nextConfig;
