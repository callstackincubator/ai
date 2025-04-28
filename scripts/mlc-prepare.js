#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check for required dependencies
function checkDependency(command, name) {
  try {
    execSync(`which ${command}`, { stdio: 'ignore' });
    console.log(`✅ ${name} found in PATH`);
    return true;
  } catch (error) {
    console.error(
      `❌ ${name} not found in PATH. Please install ${name} first.`
    );
    return false;
  }
}

// Validate required dependencies
const hasGitLFS = checkDependency('git-lfs', 'Git LFS');
const hasRustup = checkDependency('rustup', 'Rustup');

if (!hasGitLFS || !hasRustup) {
  console.error('\n🔧 Please install the missing dependencies:');
  if (!hasGitLFS) {
    console.error('- Git LFS: https://git-lfs.com');
  }
  if (!hasRustup) {
    console.error('- Rustup: https://rustup.rs');
  }
  process.exit(1);
}

const projectRoot = process.cwd();

const args = process.argv.slice(2);
const rootIndex = args.findIndex((arg) => arg === '--root');
const platformIndex = args.findIndex((arg) => arg === '--platform');

const rootDir = rootIndex !== -1 ? args[rootIndex + 1] : projectRoot;
const platformArg =
  platformIndex !== -1 ? args[platformIndex + 1]?.toLowerCase() : null;

let platforms = ['android', 'ios'];
if (platformArg) {
  if (platformArg !== 'android' && platformArg !== 'ios') {
    console.error('❌ Invalid platform. Must be either "android" or "ios"');
    process.exit(1);
  }
  platforms = [platformArg];
}

if (!process.env.MLC_LLM_SOURCE_DIR) {
  console.error(
    'MLC LLM home is not specified. Please obtain a copy of MLC LLM source code by cloning https://github.com/mlc-ai/mlc-llm, and set environment variable "MLC_LLM_SOURCE_DIR=path/to/mlc-llm"'
  );
  process.exit(1);
}

const configPath = path.join(rootDir, 'mlc-config.json');
const androidPath = path.join(rootDir, 'android');
const iosPath = path.join(rootDir, 'ios');

if (!fs.existsSync(configPath)) {
  console.error('❌ Config file not found in project root: mlc-config.json');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
console.log(config);

if (platforms.includes('android')) {
  if (!process.env.ANDROID_NDK || !process.env.TVM_NDK_CC) {
    console.error(
      '❌ Missing required environment variables for Android build:'
    );
    if (!process.env.ANDROID_NDK) console.error('- ANDROID_NDK not set');
    if (!process.env.TVM_NDK_CC) console.error('- TVM_NDK_CC not set');
    console.error('\nPlease set these variables following the guide at:');
    console.error('https://llm.mlc.ai/docs/deploy/android.html#id2');

    // Remove Android from platforms to process
    platforms = platforms.filter((p) => p !== 'android');

    // Only exit if Android was the only platform
    if (platforms.length === 0) {
      process.exit(1);
    }
  }

  const androidConfig = JSON.stringify(
    {
      device: 'android',
      model_list: config.android.map((model) => ({
        ...model,
        bundle_weight: false,
      })),
    },
    null,
    2
  );
  fs.writeFileSync(
    path.join(androidPath, 'mlc-package-config.json'),
    androidConfig
  );
}

if (platforms.includes('ios')) {
  const iosConfig = JSON.stringify(
    {
      device: 'iphone',
      model_list: config.iphone.map((model) => ({
        ...model,
        bundle_weight: false,
      })),
    },
    null,
    2
  );
  fs.writeFileSync(path.join(iosPath, 'mlc-package-config.json'), iosConfig);
}

console.log('🚀 Copying config to selected platforms...');

if (platforms.includes('android')) {
  console.log('📦 Running "mlc_llm package" for Android...');
  execSync('cd android && mlc_llm package', { stdio: 'inherit' });
}

if (platforms.includes('ios')) {
  console.log('📦 Running "mlc_llm package" for iOS...');
  execSync('cd ios && mlc_llm package', { stdio: 'inherit' });
}

console.log('✅ Model packaging complete!');
