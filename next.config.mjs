/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export for Capacitor native apps
  output: 'export',
  
  // Required for static export
  trailingSlash: true,
  
  typescript: {
    ignoreBuildErrors: true,
  },
  
  images: {
    unoptimized: true,
  },
}

export default nextConfig
