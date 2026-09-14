FROM node:22-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./

# Install all deps (vite/typescript needed for build), then prune after build.
RUN npm ci && npm cache clean --force

COPY . .

RUN npx prisma generate && npm run build && npm prune --omit=dev

CMD ["npm", "run", "docker-start"]
