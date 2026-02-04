# Agent Style Guide

## Commit Messages

- Conventional Commits format `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `chore`, `docs`
- Scope optional, use package name when relevant (e.g., `expo-example`, `llama`)
- Lowercase, no period, imperative mood
- Example: `feat(expo-example): add maxSteps setting for tool iterations`

## Branch Naming

- Format: `type/kebab-case-description`
- Types: `feat/`, `fix/`, `refactor/`, `chore/`, `docs/`, `ci/`
- Example: `feat/tool-calling`, `fix/streaming-first-char-missing`

## Stacked PRs

- Create feature branch from `main`
- Atomic commits that can be reviewed independently
- Reference related PRs in commit messages when building on unmerged work
- One logical change per commit

## Code Style

- Package manager: `bun` (not npm/yarn)
- No semicolons
- Single quotes
- Imports auto-sorted (ESLint enforced)
- Run `bun lint` before committing

## Project Structure

- Monorepo with `packages/` (libraries) and `apps/` (example apps)
- Packages: `@react-native-ai/apple`, `@react-native-ai/llama`, `@react-native-ai/mlc`
- Example app: Expo SDK 54 in `apps/expo-example/`

## Tech Stack

- React 19.1 with React Compiler (no manual `useMemo`/`useCallback` needed)
- React Native 0.81
- Expo SDK 54 with native modules
- Vercel AI SDK v6 (`ai` package) for model abstraction
- TypeScript strict mode

## UI & Styling

- `@expo/ui` for SwiftUI-bridged components (Button, Slider, ContextMenu)
- `expo-symbols` for SF Symbols icons
- `expo-blur` and `expo-glass-effect` for glass morphism
- `PlatformColor` for iOS semantic colors (no hardcoded colors)
- `StyleSheet.create` for styles (no inline objects)
- `react-native-reanimated` for animations

## State Management

- `jotai` for global state with atoms
- `atomWithStorage` + AsyncStorage for persistence
- Custom hooks (e.g., `useChatStore`) to expose store API

## Patterns

- Adapter pattern for AI providers (`SetupAdapter<TModel>` interface)
- Prefer composition over configuration
- Keep components focused, extract hooks for logic
- Use `zod` for runtime validation
