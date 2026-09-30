FROM oven/bun:1.2.21 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
RUN bun run build

FROM oven/bun:1.2.21
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/package.json ./package.json
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD bun -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["bun", "run", "dist/server.js"]
