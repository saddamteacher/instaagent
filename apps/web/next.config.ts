import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@jarvisgram/shared", "@jarvisgram/db"],
  serverExternalPackages: ["pg", "@prisma/client", "@prisma/adapter-pg"],
  poweredByHeader: false,
};

export default config;
