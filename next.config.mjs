/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained server build for a lean Docker image (Cloud Run).
  output: 'standalone',
};

export default nextConfig;
