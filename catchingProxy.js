#!/usr/bin/env node

function parsePort(args) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--port' && i + 1 < args.length) {
        const port = parseInt(args[i + 1], 10);
        console.log('Found port:', port);
        return port;
      }
    }
    return null;
}

function parseOrigin(args) {
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--origin' && i + 1 < args.length) {
        const origin = args[i + 1];
        console.log('Found origin:', origin);
        return origin;
      }
    }
    return null;
}

function parseClearCache(args) {
    const hasFlag = args.includes('--clear-cache');
    if (hasFlag) {
      console.log('Clear cache flag found');
    }
    return hasFlag;
}

console.log('User Arguments: ', process.argv.slice(2));
const args = process.argv.slice(2); 

const port = parsePort(args);
const origin = parseOrigin(args);
const clearCache = parseClearCache(args);

const cache = {};
console.log('Cache storage initialized');

if (clearCache) {
    console.log('Clearing cache...');
    Object.keys(cache).forEach(key => delete cache[key]);
    console.log('Cache cleared!');
    console.log(`Cleared ${Object.keys(cache).length} cached entries`);
    process.exit(0);
}

if (!port) {
  console.error('Error: --port is required');
  process.exit(1);
}

if (isNaN(port) || port < 1 || port > 65535) {
  console.error('Error: --port must be a number between 1 and 65535');
  console.error('You provided:', port);
  process.exit(1);
}

if (!origin) {
  console.error('Error: --origin is required');
  process.exit(1);
}

try {
  new URL(origin);
  console.log('Origin URL is valid');
} catch (error) {
  console.error('Error: --origin must be a valid URL i.e. http://dummyjson.com');
  console.error('You provided:', origin);
  process.exit(1);
}

console.log('All arguments validated successfully!');
console.log('Port:', port);
console.log('Origin:', origin);
console.log('');
const config = { port, origin };

const http = require('http');
const https = require('https');

const server = http.createServer((req, res) => {
    
    const requestPath = req.url;
    const cacheKey = `${req.method}:${requestPath}`;
    console.log('');
    console.log('Cache key:', cacheKey);
    
    const cleanOrigin = config.origin.replace(/\/+$/, '');
    const cleanPath = requestPath.startsWith('/') ? requestPath : '/' + requestPath;
    const originUrl = cleanOrigin + cleanPath;
    
    const url = new URL(originUrl);
    const options = {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname + (url.search || ''),
        method: req.method,
        headers: req.headers,
        rejectUnauthorized: false
    };
    
    if (cache[cacheKey]) {
        console.log('Cache HIT! Returning cached response');
        
        const cached = cache[cacheKey];
        const cachedHeaders = { ...cached.headers };
        cachedHeaders['X-Cache'] = 'HIT';
        
        res.writeHead(cached.statusCode, cachedHeaders);
        res.write(cached.body);
        res.end();
        
        console.log(`${req.method} ${requestPath} → ${cached.statusCode} (from cache)`);
        
        return;
    }
    
    console.log('Cache MISS - forwarding to origin server');
    console.log(`${req.method} ${requestPath}`);
    
    const requestModule = url.protocol === 'https:' ? https : http;
    const proxyReq = requestModule.request(options, (proxyRes) => {
        console.log('Received response from origin server');
        console.log('Status:', proxyRes.statusCode);
        
        const responseHeaders = { ...proxyRes.headers };
       
        delete responseHeaders['connection'];
        delete responseHeaders['transfer-encoding'];
        
        responseHeaders['X-Cache'] = 'MISS';
        res.writeHead(proxyRes.statusCode, responseHeaders);
        
        let responseBody = '';
        
        proxyRes.on('data', (chunk) => {
            res.write(chunk);
            responseBody += chunk.toString();
        });
        
        proxyRes.on('end', () => {
            res.end();
            
            cache[cacheKey] = {
                statusCode: proxyRes.statusCode,
                headers: responseHeaders,
                body: responseBody
            };
            console.log('');
            console.log('In origin server response: ');
            console.log(`${req.method} ${requestPath} → ${proxyRes.statusCode}`);
            console.log('Response body forwarded to client');
        });

        proxyRes.on('error', (error) => {
            console.error('Error receiving response from origin:', error.message);
            if (!res.headersSent) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
            }
            res.end('Error: Failed to receive response from origin server');
        });
    });
    
    proxyReq.on('error', (error) => {
        console.error('Error forwarding request:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error: Could not connect to origin server');
    });
    
    proxyReq.end();
});
  
console.log('HTTP server created (but not started yet)');

server.listen(config.port, () => {
    console.log(`Server is now listening on port ${config.port}`);
    console.log(`Ready to receive requests!`);
    console.log(`Try visiting: http://localhost:${config.port}/test`);
    console.log('');
});