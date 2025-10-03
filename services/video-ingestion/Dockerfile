# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# # Remove existing node_modules and lock files
# RUN rm -rf node_modules package-lock.json yarn.lock

# # Clear npm cache
# RUN npm cache clean --force

# RUN npm install --save path-to-regexp

# # Install dependencies
RUN npm install ioredis && npm install

# RUN npm install ioredis && npm install node-fetch && npm install

# RUN npm install

# RUN npm ci

# Copy the rest of your app's source code
COPY . .

# Make port 3001 available
EXPOSE 3001

# Run the app when the container launches
CMD ["node", "server.js"]

