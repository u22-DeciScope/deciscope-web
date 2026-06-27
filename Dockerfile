FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV HOST=0.0.0.0
ENV PORT=5193

EXPOSE 5193

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5193"]
