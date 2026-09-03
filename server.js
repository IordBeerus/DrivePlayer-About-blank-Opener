const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 3000;
const root = __dirname;
const mimeTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp'
};

async function proxyMangaDex(req, res, requestPath, query) {
    let target;
    if (requestPath === '/api/manga/search') {
        target = `https://api.mangadex.org/manga?title=${encodeURIComponent(query.get('title') || '')}&limit=100&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica&includes[]=cover_art`;
    } else if (requestPath.startsWith('/api/manga/') && requestPath.endsWith('/feed')) {
        const id = requestPath.slice('/api/manga/'.length, -'/feed'.length);
        target = `https://api.mangadex.org/manga/${encodeURIComponent(id)}/feed?limit=20&order[chapter]=asc&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica`;
    } else if (requestPath.startsWith('/api/chapter/')) {
        const id = requestPath.slice('/api/chapter/'.length);
        target = `https://api.mangadex.org/at-home/server/${encodeURIComponent(id)}`;
    } else {
        return false;
    }
    try {
        const response = await fetch(target, { headers: { Accept: 'application/json' } });
        const body = await response.text();
        res.writeHead(response.status, { 'Content-Type': response.headers.get('content-type') || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
    } catch (error) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MangaDex proxy failed', message: error.message }));
    }
    return true;
}

const server = http.createServer(async (req, res) => {
    const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const query = new URL(req.url || '/', 'http://localhost').searchParams;
    if (await proxyMangaDex(req, res, requestPath, query)) return;
    const requestedFile = requestPath === '/' ? '/index.html' : requestPath;
    const filePath = path.resolve(root, `.${requestedFile}`);

    if (!filePath.startsWith(`${root}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(error.code === 'ENOENT' ? 404 : 500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
            return;
        }
        const type = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type });
        res.end(content);
    });
});

server.listen(port, '0.0.0.0', () => {
    console.log(`MILKBOX running at http://localhost:${port}`);
});
