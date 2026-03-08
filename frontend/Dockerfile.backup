# Frontend Dockerfile - Serves static HTML/CSS/JS files with nginx
FROM nginx:alpine

# Set working directory
WORKDIR /usr/share/nginx/html

# Copy all static files to nginx html directory
COPY index.html icon-192.png icon-512.png manifest.json service-worker.js ./

# Copy JavaScript modules
COPY js-refactored ./js-refactored/

# Copy custom nginx configuration
COPY nginx-frontend.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
