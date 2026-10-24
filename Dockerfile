FROM node:22-bookworm-slim

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NPM_CONFIG_PRODUCTION=false
ENV NODE_OPTIONS=--max-old-space-size=4096

COPY package.json package-lock.json ./
# Drop every credential Railway injects. A stale npm token makes `npm ci` 401.
RUN printf '%s\n' 'registry=https://registry.npmjs.org/' > /tmp/npmrc \
 && env -i PATH="$PATH" HOME=/root NPM_CONFIG_CACHE=/tmp/npm-cache \
      npm ci --include=dev \
        --userconfig=/tmp/npmrc \
        --globalconfig=/tmp/npmrc \
        --registry=https://registry.npmjs.org/

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000
CMD ["npm", "run", "start:railway"]
