/**
 * Hostinger Static Website Deploy Script
 *
 * Replicates the Hostinger MCP deploy flow:
 * 1. Resolve username from domain
 * 2. Fetch upload credentials (TUS endpoint + auth tokens)
 * 3. Upload archive via TUS protocol
 * 4. Trigger deploy on Hostinger
 */

import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const API_TOKEN = process.env.HOSTINGER_API_TOKEN;
const DOMAIN = process.env.HOSTINGER_DOMAIN || 'backoffice.tiktally.com.br';
const BASE_URL = 'https://developers.hostinger.com';

if (!API_TOKEN) {
  console.error('ERROR: HOSTINGER_API_TOKEN env var is required.');
  console.error('  Local: export HOSTINGER_API_TOKEN=... (or use a .env file)');
  console.error('  CI:    configure the HOSTINGER_API_TOKEN GitHub secret');
  process.exit(1);
}

const archivePath = process.argv[2];
if (!archivePath || !fs.existsSync(archivePath)) {
  console.error('Usage: node hostinger-deploy.mjs <archive-path>');
  process.exit(1);
}

function apiRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`API ${res.statusCode}: ${JSON.stringify(parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          if (res.statusCode >= 400) {
            reject(new Error(`API ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

function tusUpload(filePath, uploadUrl, authToken, authRestToken) {
  return new Promise((resolve, reject) => {
    const stats = fs.statSync(filePath);
    const fileName = path.basename(filePath);
    const cleanUrl = uploadUrl.replace(/\/$/, '');
    const fullUrl = `${cleanUrl}/${fileName}?override=true`;
    const parsed = new URL(fullUrl);

    const headers = {
      'X-Auth': authToken,
      'X-Auth-Rest': authRestToken,
    };

    // Step 1: Pre-upload POST (TUS creation) to create the file entry
    const preReq = https.request({
      method: 'POST',
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: {
        ...headers,
        'Content-Length': 0,
        'Upload-Length': stats.size.toString(),
        'Tus-Resumable': '1.0.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode !== 201) {
          reject(new Error(`Pre-upload failed (${res.statusCode}): ${data}`));
          return;
        }

        // Step 2: TUS PATCH upload
        const fileStream = fs.readFileSync(filePath);
        const patchReq = https.request({
          method: 'PATCH',
          hostname: parsed.hostname,
          path: parsed.pathname + parsed.search,
          headers: {
            ...headers,
            'Content-Type': 'application/offset+octet-stream',
            'Upload-Offset': '0',
            'Content-Length': stats.size,
            'Tus-Resumable': '1.0.0',
          },
        }, (patchRes) => {
          let patchData = '';
          patchRes.on('data', (chunk) => (patchData += chunk));
          patchRes.on('end', () => {
            if (patchRes.statusCode >= 200 && patchRes.statusCode < 300) {
              resolve({ filename: fileName, url: fullUrl });
            } else {
              reject(new Error(`TUS upload failed (${patchRes.statusCode}): ${patchData}`));
            }
          });
        });

        patchReq.on('error', reject);
        patchReq.setTimeout(300000, () => {
          patchReq.destroy();
          reject(new Error('Upload timeout'));
        });
        patchReq.write(fileStream);
        patchReq.end();
      });
    });

    preReq.on('error', reject);
    preReq.setTimeout(60000, () => {
      preReq.destroy();
      reject(new Error('Pre-upload timeout'));
    });
    preReq.end();
  });
}

async function deploy() {
  const archiveBasename = path.basename(archivePath);

  // 1. Resolve username from domain
  console.log(`  Resolving username for ${DOMAIN}...`);
  const websitesResp = await apiRequest('GET', `/api/hosting/v1/websites?domain=${encodeURIComponent(DOMAIN)}`);
  const websites = websitesResp?.data;
  if (!websites || websites.length === 0) {
    throw new Error(`No website found for domain: ${DOMAIN}`);
  }
  const username = websites[0].username;
  console.log(`  Username: ${username}`);

  // 2. Fetch upload credentials
  console.log('  Fetching upload credentials...');
  const creds = await apiRequest('POST', '/api/hosting/v1/files/upload-urls', {
    username,
    domain: DOMAIN,
  });
  const { url: uploadUrl, auth_key: authToken, rest_auth_key: authRestToken } = creds;
  if (!uploadUrl || !authToken || !authRestToken) {
    throw new Error('Invalid upload credentials from API');
  }
  console.log('  Upload credentials received.');

  // 3. Upload archive via TUS
  const stats = fs.statSync(archivePath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  console.log(`  Uploading ${archiveBasename} (${sizeMB} MB)...`);
  const uploadResult = await tusUpload(archivePath, uploadUrl, authToken, authRestToken);
  console.log(`  Upload complete: ${uploadResult.filename}`);

  // 4. Trigger deploy
  console.log(`  Triggering deploy for ${DOMAIN}...`);
  const deployResult = await apiRequest(
    'POST',
    `/api/hosting/v1/accounts/${username}/websites/${DOMAIN}/deploy`,
    { archive_path: archiveBasename }
  );
  console.log('  Deploy triggered successfully!');

  return deployResult;
}

deploy()
  .then(() => process.exit(0))
  .catch((err) => {
    const detail = err?.message || err?.code || (err ? String(err) : 'unknown error (empty)');
    console.error(`\n  ERROR: ${detail}`);
    if (err?.code) console.error(`  code: ${err.code}`);
    if (err?.stack) console.error(err.stack);
    process.exit(1);
  });
