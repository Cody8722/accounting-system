# Frontend Dockerfile - Serves static HTML/CSS/JS files with nginx
FROM nginx:alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Copy all static files to nginx html directory
COPY index.html icon-192.png icon-512.png manifest.json service-worker.js ./

# Copy CSS directory if it exists
COPY css ./css/

# Copy JavaScript modules
COPY js-refactored ./js-refactored/

# Copy custom nginx configuration
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

# Expose port 8080 (Zeabur default)
EXPOSE 8080

# Update nginx config to listen on port 8080
RUN sed -i 's/listen 80;/listen 8080;/g' /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
