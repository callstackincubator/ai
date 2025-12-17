# Contributing

Thank you for your interest in contributing to React Native AI! This guide will help you get started.

## Prerequisites

- **Bun** (latest version recommended)
- **React Native development environment** (Android Studio, Xcode)

## Project Structure

This is a monorepo with the following packages:

- **`packages/mlc/`** - MLC-LLM integration for React Native
- **`packages/apple-llm/`** - Apple Intelligence turbo module for iOS
- **`apps/example/`** - React Native CLI example app
- **`apps/example-apple/`** - Expo example app showcasing Apple Intelligence

## Quick Start

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/callstackincubator/ai.git
   cd ai
   bun install
   ```

2. **Run quality checks:**
   ```bash
   bun run typecheck
   bun run lint
   ```

3. **Test your changes:**
   ```bash
   # Run React Native Community CLI example (MLC)
   cd apps/example
   bun run start
   bun run android  # or ios
   
   # Run Expo example (Apple Intelligence)
   cd apps/example-apple
   bun run start
   bun run ios
   ```

## Development Guidelines

### Code Quality

- Follow existing code style and patterns
- Ensure TypeScript types are properly defined
- Run `bun run lint --fix` to fix formatting issues

### Native Code

- **Android**: Use Kotlin, follow existing patterns in `packages/*/android/`
- **iOS**: Use Swift/Objective-C++, follow existing patterns in `packages/*/ios/`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new features
- `fix:` bug fixes
- `docs:` documentation changes
- `refactor:` code refactoring
- `test:` test additions/updates
- `chore:` tooling/config changes

## Pull Request Process

1. **Fork** the repository
2. **Create a feature branch** from `main`
3. **Make your changes** following the guidelines above
4. **Test thoroughly** with both example apps
5. **Submit a pull request** with:
   - Clear description of changes
   - Screenshots/videos for UI changes
   - Test plan for reviewers

## Common Tasks

### Working with packages

Build all packages

```bash 
bun run --filter='@react-native-ai/*' prepare
```

Work on specific package

```bash
cd packages/mlc
bun run typecheck
```

### Running examples

MLC example (React Native CLI)

```bash
cd apps/example
bun run prestart    # Setup MLC dependencies
bun run start
bun run android
```

Apple Intelligence example (Expo)

```bash
cd apps/example-apple
bun run ios
```

### Native Development

- **Android**: Open `apps/example/android` in Android Studio
- **iOS MLC**: Open `apps/example/ios/AiExample.xcworkspace` in Xcode

- **iOS Apple Intelligence**: Open `apps/example-apple/ios/exampleapple.xcworkspace` in Xcode
  - The Apple Intelligence package is a Turbo Module - work directly from the integrated Xcode project
  - Native code is in `packages/apple-llm/ios/` but best developed through the example app

## Need Help?

- Check existing [issues](https://github.com/callstackincubator/ai/issues)
- Review the [code of conduct](CODE_OF_CONDUCT.md)
- Ask questions in pull request discussions

We appreciate all contributions, big and small! 🚀
