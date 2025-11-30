FROM node:22

# Install Ghostscript
RUN apt-get update && apt-get install -y ghostscript

# Set working directory
WORKDIR /app

# Copy package.json and install dependencies
COPY package.json ./
RUN npm install

# Copy the rest of your app
COPY . .

# Expose port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
