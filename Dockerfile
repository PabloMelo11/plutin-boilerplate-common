# BUILDER STAGE
FROM node:22-alpine as builder
WORKDIR /usr/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run dist

# RUNTIME STAGE
FROM node:22-alpine as runtime
WORKDIR /usr/app
ENV NODE_ENV=production
COPY --from=builder "/usr/app/dist/" "/usr/app/dist/"
COPY --from=builder "/usr/app/node_modules/" "/usr/app/node_modules/"
COPY --from=builder "/usr/app/package.json" "/usr/app/package.json"
# copy prisma file?
RUN npm prune --production
EXPOSE 3333
CMD ["npm", "start"]
