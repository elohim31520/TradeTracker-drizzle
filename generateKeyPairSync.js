const { generateKeyPairSync } = require('crypto');
const fs = require('fs');
const path = require('path');

const privateKeyPath = process.argv[2];
const publicKeyPath = process.argv[3];

if (!privateKeyPath || !publicKeyPath) {
  console.error("❌ Usage: node generateKeyPairSync.js <privateKeyPath> <publicKeyPath>");
  process.exit(1);
}

// 1. 確保目錄存在
const dir = path.dirname(privateKeyPath);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// 2. 檢查檔案是否已存在，避免意外覆蓋 (安全性)
if (fs.existsSync(privateKeyPath) || fs.existsSync(publicKeyPath)) {
  console.log("⚠️  Keys already exist. Skipping generation to prevent overwriting.");
  process.exit(0);
}

try {
  console.log("⏳ Generating 2048-bit RSA key pair...");

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });

  // 3. 寫入檔案
  fs.writeFileSync(privateKeyPath, privateKey);
  fs.writeFileSync(publicKeyPath, publicKey);

  // 4. 修改權限 (僅限 Linux/Unix)
  // 600: 只有擁有者可讀寫 (常用於私鑰)
  // 644: 擁有者讀寫，其他人唯讀 (常用於公鑰)
  try {
    fs.chmodSync(privateKeyPath, 0o600);
    fs.chmodSync(publicKeyPath, 0o644);
    console.log("🔒 Permissions set to 600 for private key.");
  } catch (chmodError) {
    console.warn("⚠️  Could not set file permissions (might be on Windows).");
  }

  console.log("✅ Keys generated successfully at:", dir);
} catch (error) {
  console.error("❌ Failed to generate keys:", error.message);
  process.exit(1);
}