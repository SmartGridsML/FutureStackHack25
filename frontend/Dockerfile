# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (or yarn.lock)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your app's source code
COPY . .

# Make port 5173 available to the world outside this container
EXPOSE 5173

# Run the app when the container launches
CMD ["npm", "run", "dev", "--", "--host"]

