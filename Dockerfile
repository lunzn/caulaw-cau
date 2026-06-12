# ────────────── base ──────────────
# 基础镜像一律钉死 docker.io 官方 digest：生产服务器走国内镜像源，
# 曾出现某镜像源给 oven/bun:1.3.8 tag 挂错内容（bun 版本不对，frozen lockfile 校验失败）。
# digest 内容寻址不可伪造；升级版本时用 hub.docker.com/v2/repositories/<repo>/tags/<tag> 的顶层 digest 同步更新。
FROM oven/bun:1.3.8@sha256:371d30538b69303ced927bb5915697ac7e2fa8cb409ee332c66009de64de5aa3 AS base
WORKDIR /app

# ────────────── deps ──────────────
FROM base AS deps
COPY package.json bun.lock ./
COPY packages/db/package.json           ./packages/db/package.json
COPY packages/gateway/package.json      ./packages/gateway/package.json
COPY packages/school-server/package.json ./packages/school-server/package.json
COPY packages/work-server/package.json  ./packages/work-server/package.json
RUN bun install --frozen-lockfile

# ────────────── migrate ──────────────
FROM base AS migrate
COPY --from=deps /app/node_modules          ./node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY packages/db ./packages/db
WORKDIR /app/packages/db
ENTRYPOINT []
CMD ["sh", "-c", "node_modules/.bin/drizzle-kit migrate; exit 0"]

# ────────────── gateway builder ──────────────
FROM deps AS gateway-builder
COPY packages/db      ./packages/db
COPY packages/gateway ./packages/gateway
ENV NEXT_TELEMETRY_DISABLED=1 DATABASE_URL=placeholder SCHOOL_SERVER_URL=placeholder
RUN bun run --cwd packages/gateway build

# ────────────── gateway ──────────────
FROM oven/bun:1.3.8-slim@sha256:68fc2eac7f5dcfc2f69a81d1db02786ab08772eda2e4404eae785c038f8d2e41 AS gateway
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 
WORKDIR /app
COPY --from=gateway-builder /app/packages/gateway/.next/standalone ./
COPY --from=gateway-builder /app/packages/gateway/.next/static     ./packages/gateway/.next/static
COPY --from=gateway-builder /app/packages/gateway/public           ./packages/gateway/public
EXPOSE 3000
CMD ["node", "packages/gateway/server.js"]

# ────────────── school-server ──────────────
FROM base AS school-server
COPY --from=deps /app/node_modules                        ./node_modules
COPY --from=deps /app/packages/school-server/node_modules ./packages/school-server/node_modules
COPY packages/school-server ./packages/school-server
EXPOSE 3002
CMD ["bun", "run", "packages/school-server/src/index.ts"]

# ────────────── work-server builder ──────────────
FROM deps AS work-server-builder
COPY packages/db          ./packages/db
COPY packages/work-server ./packages/work-server
RUN bun build \
    --compile \
    --minify-whitespace \
    --minify-syntax \
    --outfile /app/work-server \
    packages/work-server/elysia.ts

# ────────────── work-server ──────────────
FROM python:3.13-slim@sha256:f82c96458eedc847b233e582eb31336f4954b39cae020b6dcf5b3ed0e5cbcd74 AS work-server
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY packages/work-server/.pi/skills/requirements.txt ./requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple \
    && rm requirements.txt
COPY --from=work-server-builder /app/work-server ./work-server
COPY packages/work-server/package.json ./package.json
COPY packages/work-server/.pi/ ./.pi/
COPY packages/work-server/assets/ ./assets/
EXPOSE 3100
CMD ["./work-server"]
