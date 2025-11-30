FROM node:22

# Install Ghostscript
RUN apt-get update && apt-get install -y ghostscript

# Create app directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Expose port
EXPOSE 3000

# Start app
CMD ["npm", "start"]
