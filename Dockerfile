FROM node:20-alpine
RUN apk add --no-cache ffmpeg font-noto-myanmar
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
RUN mkdir -p uploads work
EXPOSE 3000
CMD ["npm","start"]
