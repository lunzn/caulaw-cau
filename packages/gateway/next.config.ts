import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: [
    "@wechatbot/wechatbot",
    "@mariozechner/pi-coding-agent",
    "@mariozechner/pi-ai",
    "@mariozechner/pi-agent-core",
    // 勿在此列出 `pg`：Turbopack 会生成错误的 `pg-<hash>` 虚拟包名导致 dev 报 Cannot find package
  ],
};

export default nextConfig;
