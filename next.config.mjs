/** @type {import('next').NextConfig} */
const nextConfig = {
  // The whole application is client-side and stores everything in localStorage,
  // so it can be exported to fully static files and hosted for free anywhere.
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
