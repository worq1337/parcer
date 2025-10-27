#!/usr/bin/env node
/*
 * Database backup to Telegram channel
 * Creates gzipped pg_dump and sends it via Bot API.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const https = require('https');

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHANNEL_ID = process.env.TG_CHANNEL_ID || '-1003237421931';

if (!TG_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN is not set. Abort.');
  process.exit(1);
}

function sendDocument(filePath) {
  return new Promise((resolve, reject) => {
    const boundary = '----WebKitFormBoundary' + Date.now();
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${TG_TOKEN}/sendDocument`,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);

    const CRLF = '\r\n';

    const writeField = (name, value) => {
      req.write(`--${boundary}${CRLF}`);
      req.write(`Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}`);
      req.write(`${value}${CRLF}`);
    };

    writeField('chat_id', TG_CHANNEL_ID);
    writeField('caption', `DB backup ${path.basename(filePath)}`);

    req.write(`--${boundary}${CRLF}`);
    req.write(`Content-Disposition: form-data; name="document"; filename="${path.basename(filePath)}"${CRLF}`);
    req.write(`Content-Type: application/gzip${CRLF}${CRLF}`);

    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('end', () => {
      req.write(CRLF);
      req.write(`--${boundary}--${CRLF}`);
      req.end();
    });
    stream.pipe(req, { end: false });
  });
}

async function createDump() {
  const dt = new Date();
  const stamp = dt.toISOString().replace(/[:.]/g, '-');
  const outDir = path.resolve(__dirname, '../backend/backups');
  fs.mkdirSync(outDir, { recursive: true });

  const sqlPath = path.join(outDir, `backup_${stamp}.sql`);
  const gzPath = `${sqlPath}.gz`;

  await new Promise((resolve, reject) => {
    const dump = spawn('pg_dump', [
      '-h', process.env.PGHOST || process.env.DB_HOST || 'postgres',
      '-p', process.env.PGPORT || process.env.DB_PORT || '5432',
      '-U', process.env.PGUSER || process.env.DB_USER || 'postgres',
      process.env.PGDATABASE || process.env.DB_NAME || 'receipt_parser'
    ], { env: process.env });

    const gzip = zlib.createGzip();
    const out = fs.createWriteStream(gzPath);

    dump.stdout.pipe(gzip).pipe(out);
    dump.stderr.on('data', (chunk) => process.stderr.write(chunk));

    out.on('finish', resolve);
    out.on('error', reject);
    dump.on('error', reject);
  });

  return gzPath;
}

function rotateBackups(directory, keep = 7) {
  const files = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith('.sql.gz'))
    .map((name) => ({ name, fullPath: path.join(directory, name) }))
    .sort((a, b) => (a.name < b.name ? 1 : -1));

  files.slice(keep).forEach((file) => {
    try {
      fs.unlinkSync(file.fullPath);
      console.log(`🧹 Removed old backup ${file.name}`);
    } catch (error) {
      console.warn(`⚠️ Failed to remove ${file.name}: ${error.message}`);
    }
  });
}

async function run() {
  try {
    const gzPath = await createDump();
    console.log(`📦 Dump created at ${gzPath}`);

    const response = await sendDocument(gzPath);
    console.log('📨 Telegram response:', response);

    rotateBackups(path.dirname(gzPath));
  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  }
}

run();
