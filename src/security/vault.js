import {
  randomBytes,
  pbkdf2Sync,
  createCipheriv,
  createDecipheriv
} from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VAULT_DIR_NAME = '.cookie-vault';
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha512';
const KEY_LENGTH = 32;
const SALT_LENGTH = 32;
const IV_LENGTH = 12; // AES-GCM standard
const ALGORITHM = 'aes-256-gcm';

function encrypt(key, plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return { iv, encrypted, authTag };
}

function decrypt(key, iv, encrypted, authTag) {
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  return decrypted.toString('utf-8');
}

function deriveKey(password, salt) {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

export function createVault(vaultPath) {
  const vaultDir = vaultPath || join(__dirname, '..', '..', VAULT_DIR_NAME);
  const vaultFile = join(vaultDir, 'vault.enc');
  const backupFile = join(vaultDir, 'vault.enc.bak');

  let derivedKey = null;
  let vaultSalt = null;

  function ensureDir() {
    if (!existsSync(vaultDir)) {
      mkdirSync(vaultDir, { recursive: true });
    }
  }

  function readVaultData() {
    if (!existsSync(vaultFile)) {
      return null;
    }
    try {
      const raw = readFileSync(vaultFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function readBackupData() {
    if (!existsSync(backupFile)) {
      return null;
    }
    try {
      const raw = readFileSync(backupFile, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeVaultData(data) {
    ensureDir();
    // Backup before modification
    if (existsSync(vaultFile)) {
      copyFileSync(vaultFile, backupFile);
    }
    writeFileSync(vaultFile, JSON.stringify(data, null, 2), 'utf-8');
  }

  function getOrCreateVaultData() {
    let data = readVaultData();
    if (!data) {
      data = {
        salt: vaultSalt.toString('hex'),
        entries: {}
      };
    }
    return data;
  }

  return {
    unlock(masterPassword) {
      if (!masterPassword || typeof masterPassword !== 'string') {
        throw new Error('Master password is required');
      }

      const existing = readVaultData();
      if (existing && existing.salt) {
        vaultSalt = Buffer.from(existing.salt, 'hex');
      } else {
        vaultSalt = randomBytes(SALT_LENGTH);
      }

      derivedKey = deriveKey(masterPassword, vaultSalt);

      // Verify key against existing entries if any
      if (existing && existing.entries) {
        const labels = Object.keys(existing.entries);
        if (labels.length > 0) {
          const firstEntry = existing.entries[labels[0]];
          try {
            decrypt(
              derivedKey,
              Buffer.from(firstEntry.iv, 'hex'),
              Buffer.from(firstEntry.data, 'hex'),
              Buffer.from(firstEntry.authTag, 'hex')
            );
          } catch {
            // Try backup
            const backup = readBackupData();
            if (backup && backup.salt) {
              const backupSalt = Buffer.from(backup.salt, 'hex');
              const backupKey = deriveKey(masterPassword, backupSalt);
              const backupLabels = Object.keys(backup.entries || {});
              if (backupLabels.length > 0) {
                const bEntry = backup.entries[backupLabels[0]];
                try {
                  decrypt(
                    backupKey,
                    Buffer.from(bEntry.iv, 'hex'),
                    Buffer.from(bEntry.data, 'hex'),
                    Buffer.from(bEntry.authTag, 'hex')
                  );
                  // Backup works, restore it
                  vaultSalt = backupSalt;
                  derivedKey = backupKey;
                  writeFileSync(vaultFile, readFileSync(backupFile, 'utf-8'), 'utf-8');
                  return true;
                } catch {
                  derivedKey = null;
                  throw new Error('Invalid master password');
                }
              }
            }
            derivedKey = null;
            throw new Error('Invalid master password');
          }
        }
      }

      // Initialize vault file if needed
      if (!existing) {
        writeVaultData({
          salt: vaultSalt.toString('hex'),
          entries: {}
        });
      }

      return true;
    },

    lock() {
      if (derivedKey) {
        derivedKey.fill(0);
      }
      derivedKey = null;
      vaultSalt = null;
    },

    isUnlocked() {
      return derivedKey !== null;
    },

    store(label, value, type = 'custom') {
      if (!derivedKey) throw new Error('Vault is locked');
      if (!label || typeof label !== 'string') throw new Error('Label is required');
      if (value === undefined || value === null) throw new Error('Value is required');

      const validTypes = ['api_key', 'email', 'password', 'custom'];
      if (!validTypes.includes(type)) {
        throw new Error(`Invalid type: ${type}. Must be one of: ${validTypes.join(', ')}`);
      }

      const payload = JSON.stringify({ value, type, storedAt: new Date().toISOString() });
      const { iv, encrypted, authTag } = encrypt(derivedKey, payload);

      const data = getOrCreateVaultData();
      data.entries[label] = {
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
        authTag: authTag.toString('hex'),
        type
      };

      writeVaultData(data);
    },

    retrieve(label) {
      if (!derivedKey) throw new Error('Vault is locked');
      if (!label) throw new Error('Label is required');

      const data = readVaultData();
      if (!data || !data.entries || !data.entries[label]) {
        return null;
      }

      const entry = data.entries[label];
      try {
        const decrypted = decrypt(
          derivedKey,
          Buffer.from(entry.iv, 'hex'),
          Buffer.from(entry.data, 'hex'),
          Buffer.from(entry.authTag, 'hex')
        );
        const parsed = JSON.parse(decrypted);
        return { label, value: parsed.value, type: parsed.type, storedAt: parsed.storedAt };
      } catch {
        // Try backup on corruption
        const backup = readBackupData();
        if (backup && backup.entries && backup.entries[label]) {
          const bEntry = backup.entries[label];
          try {
            const decrypted = decrypt(
              derivedKey,
              Buffer.from(bEntry.iv, 'hex'),
              Buffer.from(bEntry.data, 'hex'),
              Buffer.from(bEntry.authTag, 'hex')
            );
            const parsed = JSON.parse(decrypted);
            return { label, value: parsed.value, type: parsed.type, storedAt: parsed.storedAt };
          } catch {
            throw new Error(`Failed to decrypt entry "${label}" from vault and backup`);
          }
        }
        throw new Error(`Failed to decrypt entry "${label}"`);
      }
    },

    list() {
      if (!derivedKey) throw new Error('Vault is locked');

      const data = readVaultData();
      if (!data || !data.entries) return [];

      return Object.entries(data.entries).map(([label, entry]) => ({
        label,
        type: entry.type
      }));
    },

    delete(label) {
      if (!derivedKey) throw new Error('Vault is locked');
      if (!label) throw new Error('Label is required');

      const data = readVaultData();
      if (!data || !data.entries || !data.entries[label]) {
        throw new Error(`Entry "${label}" not found`);
      }

      delete data.entries[label];
      writeVaultData(data);
    },

    rotatePassword(oldPassword, newPassword) {
      if (!newPassword || typeof newPassword !== 'string') {
        throw new Error('New password is required');
      }

      // Verify old password
      const data = readVaultData();
      if (!data) throw new Error('No vault data found');

      const oldSalt = Buffer.from(data.salt, 'hex');
      const oldKey = deriveKey(oldPassword, oldSalt);

      // Decrypt all entries with old key
      const decryptedEntries = {};
      for (const [label, entry] of Object.entries(data.entries || {})) {
        try {
          const decrypted = decrypt(
            oldKey,
            Buffer.from(entry.iv, 'hex'),
            Buffer.from(entry.data, 'hex'),
            Buffer.from(entry.authTag, 'hex')
          );
          decryptedEntries[label] = JSON.parse(decrypted);
        } catch {
          throw new Error(`Failed to decrypt entry "${label}" with old password`);
        }
      }

      // Generate new salt and key
      const newSalt = randomBytes(SALT_LENGTH);
      const newKey = deriveKey(newPassword, newSalt);

      // Re-encrypt all entries
      const newData = {
        salt: newSalt.toString('hex'),
        entries: {}
      };

      for (const [label, payload] of Object.entries(decryptedEntries)) {
        const { iv, encrypted, authTag } = encrypt(newKey, JSON.stringify(payload));
        newData.entries[label] = {
          iv: iv.toString('hex'),
          data: encrypted.toString('hex'),
          authTag: authTag.toString('hex'),
          type: payload.type
        };
      }

      writeVaultData(newData);

      // Update internal state
      vaultSalt = newSalt;
      if (derivedKey) derivedKey.fill(0);
      derivedKey = newKey;
    },

    export() {
      if (!derivedKey) throw new Error('Vault is locked');

      const data = readVaultData();
      if (!data) throw new Error('No vault data found');

      // Encrypt the entire vault data as a blob
      const payload = JSON.stringify(data);
      const exportSalt = randomBytes(SALT_LENGTH);
      const { iv, encrypted, authTag } = encrypt(derivedKey, payload);

      return Buffer.from(JSON.stringify({
        version: 1,
        exportSalt: exportSalt.toString('hex'),
        iv: iv.toString('hex'),
        data: encrypted.toString('hex'),
        authTag: authTag.toString('hex'),
        exportedAt: new Date().toISOString()
      })).toString('base64');
    },

    import(blob, password) {
      if (!blob || !password) throw new Error('Blob and password are required');

      let parsed;
      try {
        parsed = JSON.parse(Buffer.from(blob, 'base64').toString('utf-8'));
      } catch {
        throw new Error('Invalid backup blob format');
      }

      if (!parsed.iv || !parsed.data || !parsed.authTag) {
        throw new Error('Backup blob is missing required fields');
      }

      // We need the vault's original salt from inside the encrypted data
      // The blob was encrypted with the derived key from the original vault password
      // Re-derive from the original vault data salt
      // First, try to decrypt using the provided password
      // We need the original salt - it's inside the encrypted data
      // So we derive key from the password + a known salt approach:
      // Actually the export encrypts with the current derived key, so we need the same password
      const existingData = readVaultData();
      let key;

      if (existingData && existingData.salt) {
        const salt = Buffer.from(existingData.salt, 'hex');
        key = deriveKey(password, salt);
      } else {
        // No existing vault, try the export salt
        const salt = Buffer.from(parsed.exportSalt, 'hex');
        key = deriveKey(password, salt);
      }

      let vaultData;
      try {
        const decrypted = decrypt(
          key,
          Buffer.from(parsed.iv, 'hex'),
          Buffer.from(parsed.data, 'hex'),
          Buffer.from(parsed.authTag, 'hex')
        );
        vaultData = JSON.parse(decrypted);
      } catch {
        throw new Error('Failed to decrypt backup. Wrong password or corrupted backup.');
      }

      writeVaultData(vaultData);

      // Update internal state
      vaultSalt = Buffer.from(vaultData.salt, 'hex');
      if (derivedKey) derivedKey.fill(0);
      derivedKey = deriveKey(password, vaultSalt);
    }
  };
}
