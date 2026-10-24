FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_PRODUCTION=false
ENV NODE_OPTIONS=--max-old-space-size=4096

COPY package.json package-lock.json ./
# Railway injects a stale npm token into the build, and npm then 401s
# instead of installing public packages anonymously.
RUN node -e "const {spawnSync}=require('child_process'); const env={...process.env}; for (const key of Object.keys(env)) { if (/auth|npm_token|npm_password|node_auth_token/i.test(key)) delete env[key]; } env.NPM_CONFIG_PRODUCTION='false'; env.NODE_ENV='development'; const result=spawnSync('npm',['ci','--include=dev','--registry','https://registry.npmjs.org/'],{stdio:'inherit',env}); process.exit(result.status ?? 1);"

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "run", "start:railway"]
