const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const generate = require('./api/generate');

const root = __dirname;
const envPath = path.join(root, 'local.env');

function loadLocalEnv() {
  let contents;
  try {
    contents = fs.readFileSync(envPath, 'utf8');
  } catch {
    throw new Error('找不到 local.env，请先在项目目录中创建配置文件。');
  }

  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!Object.prototype.hasOwnProperty.call(process.env, key)) process.env[key] = value;
  }
}

loadLocalEnv();

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost:3000');
  if (url.pathname === '/api/generate') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ message: '请使用 POST 请求。' }));
      return;
    }

    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      rawBody += chunk;
      if (Buffer.byteLength(rawBody, 'utf8') > 16 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: '提交内容过长，请缩短后再试。' }));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (res.writableEnded) return;
      try {
        req.body = JSON.parse(rawBody);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ message: '请求内容无法识别，请检查后再试。' }));
        return;
      }
      generate(req, res);
    });
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    fs.readFile(path.join(root, 'index.html'), (error, content) => {
      if (error) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('页面暂时无法打开。');
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store'
      });
      res.end(content);
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('没有找到这个页面。');
});

server.listen(3000, '127.0.0.1', () => {
  console.log('小红书标题生成器已启动：http://localhost:3000');
});
