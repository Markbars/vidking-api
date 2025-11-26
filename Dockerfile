FROM ghcr.io/puppeteer/puppeteer:latest

USER root
WORKDIR /usr/src/app

COPY package*.json ./

# WE USE INSTALL INSTEAD OF CI TO FIX THE VERSION CONFLICT
RUN npm install

COPY . .

CMD [ "node", "server.js" ]
