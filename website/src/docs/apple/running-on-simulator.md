# Running on Simulator

This guide helps you configure Apple Intelligence to work with the iOS Simulator in your React Native applications.

Apple Intelligence must be enabled on your macOS system before it can be used in the iOS Simulator. Follow these steps to ensure proper configuration.

## Prerequisites

Before running Apple Intelligence on the simulator, verify your macOS settings are correctly configured.

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

After changing your region to a supported location, the Apple Intelligence toggle should appear in your system settings.

> [!NOTE]
> United States is one of the supported regions, but Apple Intelligence may be available in other regions as well. Check Apple's official documentation for the complete list of supported regions.

## Step 3: Enable Apple Intelligence

Once your language and region are configured:

1. Open **System Settings** > **Apple Intelligence & Siri**
2. Toggle on **Apple Intelligence**
3. macOS will begin downloading the required models
4. Wait for the download to complete before testing in the simulator

> [!NOTE]
> The model download may take several minutes depending on your internet connection. Ensure you have sufficient disk space available.

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
- Verify that `apple.isAvailable()` returns `true` in your code (see [Availability Check](./generating#availability-check))
- Check that your app is running on iOS 26+ in the simulator

## API Availability

Always check if Apple Intelligence is available before using it in your application. See the [Availability Check](./generating#availability-check) section in the Generating guide for details on how to implement this check.
