FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
# Template: $API_URL is substituted at container start (nginx:alpine built-in envsubst)
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# PORT: Railway injeta a porta; default 80 para docker-compose local
ENV PORT=80
# API_URL: Railway usa internal hostname; docker-compose usa nome do serviço
ENV API_URL=http://api:8081

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
