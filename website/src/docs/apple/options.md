# Options

Both `generateText` and `generateStream` accept an optional second parameter with generation options:

## Available Options

- `temperature` (number): Controls randomness of output. Higher values = more creative, lower values = more focused. Maximum value is `2.0`
- `maxTokens` (number): Maximum number of tokens in the response
- `topK` (number): Limits sampling to top K most likely tokens
- `topP` (number): Nucleus sampling threshold (cannot be used with topK). Maximum value is `1.0`.
- `schema` (ZodObject): Zod schema for structured output

> [!NOTE]
> You cannot specify both `topK` and `topP` simultaneously

## Example

```typescript
const result = await foundationModels.generateText(messages, {
  temperature: 0.7,
  maxTokens: 500,
  topP: 0.9,
});
```