FROM node:20-alpine AS builder

WORKDIR /app

# Copia tudo de uma vez — qualquer mudança de arquivo invalida o cache do npm install também
# Isso garante que o build sempre pega os arquivos mais recentes
COPY . .
RUN npm install
RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

ENV PORT=80
ENV API_URL=http://api:8081

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
