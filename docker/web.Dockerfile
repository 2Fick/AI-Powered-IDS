# Image for the dashboard.
#
# Built in two stages so the runtime image carries the compiled output and its
# runtime dependencies, not the whole toolchain.
FROM node:22-alpine AS builder

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./

# The dashboard calls the API from the browser, so this address has to be one
# the browser can reach, not a name that only resolves inside the compose
# network. It is baked in at build time because Next.js inlines NEXT_PUBLIC_
# values into the client bundle.
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

CMD ["node", "server.js"]
