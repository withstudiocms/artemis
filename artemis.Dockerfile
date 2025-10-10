FROM node:alpine AS base
ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS build
COPY . /usr/src/app
WORKDIR /usr/src/app
RUN --mount=type=cache,id=/pnpm/store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run --filter=artemis build
RUN pnpm deploy --filter=artemis --prod /prod/artemis

FROM base
COPY --from=build /prod/artemis /prod/artemis
WORKDIR /prod/artemis

ENV HTTP_PORT=3000
ENV DEBUG=false
EXPOSE 3000

CMD [ "node", "dist/main.cjs" ]