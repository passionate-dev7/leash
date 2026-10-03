FROM node:24-slim
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter @leash/api... \
  && rm -rf apps/api/data \
  && ln -s /data/api apps/api/data
ENV HOME=/data/home LEASH_API_HOST=0.0.0.0 LEASH_API_PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["sh", "/app/deploy/fly-entry.sh"]
