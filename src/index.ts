import { Hono } from 'hono';

const app = new Hono();

// GET /hello endpoint
app.get('/hello', (c) => {
  return c.json({ 
    message: 'Hello from REST API!',
    timestamp: new Date().toISOString(),
    framework: 'Hono',
    runtime: 'Bun'
  });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Root endpoint
app.get('/', (c) => {
  return c.json({ 
    message: 'Welcome to the REST API',
    version: '1.0.0',
    endpoints: ['/hello', '/health']
  });
});

const port = process.env.PORT || 3000;

console.log(`🚀 Server starting on port ${port}`);

export default {
  port,
  fetch: app.fetch,
};
