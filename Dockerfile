FROM node:22
RUN apt-get update && apt-get install -y ghostscript
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
