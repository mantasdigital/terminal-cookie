import { execSync } from 'child_process';
import { platform } from 'os';

const SERVICE_NAME = 'terminal-cookie';

function run(command) {
  return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function getMacOSKeychain() {
  return {
    store(service, account, password) {
      // Delete existing entry first (ignore errors if not found)
      try {
        run(`security delete-generic-password -s "${service}" -a "${account}" 2>/dev/null`);
      } catch {
        // Entry may not exist
      }
      run(`security add-generic-password -s "${service}" -a "${account}" -w "${password.replace(/"/g, '\\"')}"`);
    },

    retrieve(service, account) {
      return run(`security find-generic-password -s "${service}" -a "${account}" -w`);
    },

    delete(service, account) {
      run(`security delete-generic-password -s "${service}" -a "${account}"`);
    }
  };
}

function getLinuxKeychain() {
  return {
    store(service, account, password) {
      // Use secret-tool from libsecret
      execSync(
        `echo -n "${password.replace(/"/g, '\\"')}" | secret-tool store --label="${service}: ${account}" service "${service}" account "${account}"`,
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
      );
    },

    retrieve(service, account) {
      return run(`secret-tool lookup service "${service}" account "${account}"`);
    },

    delete(service, account) {
      run(`secret-tool clear service "${service}" account "${account}"`);
    }
  };
}

function getWindowsKeychain() {
  return {
    store(service, account, password) {
      const escapedPassword = password.replace(/'/g, "''");
      const ps = `
        $cred = New-Object System.Management.Automation.PSCredential("${account}", (ConvertTo-SecureString "${escapedPassword}" -AsPlainText -Force));
        $target = "${service}:${account}";
        cmdkey /generic:$target /user:${account} /pass:${escapedPassword}
      `.trim();
      run(`powershell -Command "${ps.replace(/"/g, '\\"')}"`);
    },

    retrieve(service, account) {
      const ps = `
        $output = cmdkey /list:${service}:${account} 2>&1;
        if ($LASTEXITCODE -ne 0) { throw "Not found" };
        $output
      `.trim();
      // cmdkey doesn't actually return the password, use a different approach
      // Fall back to reading from credential manager via PowerShell
      const result = run(
        `powershell -Command "[System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR((Get-StoredCredential -Target '${service}:${account}').Password))"`
      );
      return result;
    },

    delete(service, account) {
      run(`cmdkey /delete:${service}:${account}`);
    }
  };
}

function getKeychainBackend() {
  const os = platform();
  switch (os) {
    case 'darwin':
      return getMacOSKeychain();
    case 'linux':
      return getLinuxKeychain();
    case 'win32':
      return getWindowsKeychain();
    default:
      return null;
  }
}

let keychainBackend = null;
let availabilityChecked = false;
let keychainAvailable = false;

function checkAvailability() {
  if (availabilityChecked) return keychainAvailable;
  availabilityChecked = true;

  try {
    const backend = getKeychainBackend();
    if (!backend) {
      keychainAvailable = false;
      return false;
    }

    const os = platform();
    // Quick test to see if the keychain tool is accessible
    switch (os) {
      case 'darwin':
        run('which security');
        break;
      case 'linux':
        run('which secret-tool');
        break;
      case 'win32':
        run('where cmdkey');
        break;
    }
    keychainBackend = backend;
    keychainAvailable = true;
  } catch {
    keychainAvailable = false;
  }

  return keychainAvailable;
}

export function isAvailable() {
  return checkAvailability();
}

export function store(service, account, password) {
  if (!checkAvailability()) {
    throw new Error('OS keychain is not available');
  }
  const svc = service || SERVICE_NAME;
  try {
    keychainBackend.store(svc, account, password);
  } catch (e) {
    throw new Error(`Failed to store in keychain: ${e.message}`);
  }
}

export function retrieve(service, account) {
  if (!checkAvailability()) {
    throw new Error('OS keychain is not available');
  }
  const svc = service || SERVICE_NAME;
  try {
    return keychainBackend.retrieve(svc, account);
  } catch (e) {
    throw new Error(`Failed to retrieve from keychain: ${e.message}`);
  }
}

function deleteEntry(service, account) {
  if (!checkAvailability()) {
    throw new Error('OS keychain is not available');
  }
  const svc = service || SERVICE_NAME;
  try {
    keychainBackend.delete(svc, account);
  } catch (e) {
    throw new Error(`Failed to delete from keychain: ${e.message}`);
  }
}

export { deleteEntry as delete };
