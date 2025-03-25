#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = process.cwd();
const configPath = path.join(projectRoot, 'mlc-config.json'); // Adjust if needed
const androidPath = path.join(projectRoot, 'android');
const iosPath = path.join(projectRoot, 'ios');

if (!fs.existsSync(configPath)) {
  console.error('❌ Config file not found in project root: mlc-config.json');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
console.log(config);
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

console.log('🚀 Copying config to Android and iOS...');
fs.writeFileSync(
  path.join(androidPath, 'mlc-package-config.json'),
  androidConfig
);
fs.writeFileSync(path.join(iosPath, 'mlc-package-config.json'), iosConfig);

// console.log("📦 Running 'mlc_llm package' for Android...");
execSync('cd android && mlc_llm package', { stdio: 'inherit' });

// console.log("📦 Running 'mlc_llm package' for iOS...");
execSync('cd ios && mlc_llm package', { stdio: 'inherit' });

console.log('✅ Model packaging complete!');
