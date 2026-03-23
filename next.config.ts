import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // twilio uses Node.js built-ins (net, tls, etc.) that Next.js's webpack
  // bundler can't handle. Marking it external lets Node require it directly
  // at runtime, which fixes the 405 on the /api/cron/notify route.
  serverExternalPackages: ['web-push'],
}

export default nextConfig
