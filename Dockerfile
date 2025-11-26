# Use a lightweight Node.js base
FROM node:18-alpine

# Install Git so we can download the code
RUN apk add --no-cache git

# Set the working folder
WORKDIR /usr/src/app

# Download the Consumet API Source Code directly
RUN git clone https://github.com/consumet/api.consumet.org.git .

# Install the engine
RUN npm install

# Build the engine
RUN npm run build

# Open the port
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
