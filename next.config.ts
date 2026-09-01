import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The project lives outside a git repo, so pin the workspace root explicitly.
  turbopack: { root: path.resolve(".") },
  // node:sqlite and the uploaded-PDF filesystem calls must stay on the server.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
