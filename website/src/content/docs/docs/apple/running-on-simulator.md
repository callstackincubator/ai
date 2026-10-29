---
title: "Running on Simulator"
---

The iOS Simulator uses your Mac's Apple Intelligence, so turn it on in macOS
first. Your Mac needs Apple Silicon.

## Step 1: Check Language Settings

Apple Intelligence and Siri must use the same language. To configure this:

1. Open **System Settings** > **Apple Intelligence & Siri**
2. Verify that both **Apple Intelligence** and **Siri** are set to the **same language**
3. If the languages don't match, update them to use the same language

## Step 2: Set Your Region

Apple Intelligence is only available in certain regions. To enable it:

1. Open **System Settings** > **General** > **Language & Region**
2. Set your **Region** to **United States** or another Apple Intelligence-supported region
3. Restart your Mac if prompted

Once the region is supported, the Apple Intelligence toggle appears in System
Settings.

## Step 3: Enable Apple Intelligence

Once your language and region are configured:

1. Open **System Settings** > **Apple Intelligence & Siri**
2. Toggle on **Apple Intelligence**
3. macOS will begin downloading the required models
4. Wait for the download to complete before testing in the simulator

The download can take several minutes, and needs free disk space.

## Step 4: Verify Simulator Access

After enabling Apple Intelligence on macOS:

1. Launch your iOS Simulator
2. The simulator will inherit Apple Intelligence capabilities from your Mac
3. Test your application to confirm Apple Foundation Models are accessible

## Common Issues

### Apple Intelligence Toggle Not Visible

If you don't see the Apple Intelligence toggle in System Settings:

- Verify your Mac supports Apple Intelligence (Apple Silicon required)
- Ensure your macOS version is up to date
- Confirm your region is set to a supported location
- Check that both Siri and Apple Intelligence language settings match

### Models Not Working in Simulator

If Apple Intelligence is enabled but models aren't working:

- Ensure the model download completed successfully on macOS
- Restart the iOS Simulator
- Check what [`apple.getModelInfo()`](/docs/apple/models#availability-and-model-info) reports in `availability`
- Check that your app is running on iOS 26+ in the simulator
