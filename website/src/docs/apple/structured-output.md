# Structured Output

Apple LLM supports structured outputs using JSON Schema. You can use libraries like Zod to generate a schema, which is then used to guide the model's output. 

## Usage

```typescript
import { foundationModels } from '@react-native-ai/apple';
import { z } from 'zod';

const schema = z.object({
  name: z.string(),
  age: z.number().int().min(0).max(150),
  email: z.string().email(),
});

const result = await foundationModels.generateText([
  { role: 'user', content: 'Create a user profile' }
], { schema });

// Result is properly typed:
// { name: string, age: number, email: string }
```

## Supported Types

- Objects, arrays, strings, numbers, booleans, enums
- Number constraints: `min`, `max`, `exclusiveMin`, `exclusiveMax`

## Unsupported Types

- String formats: `date-time`, `time`, `date`, `duration`, `email`, `hostname`, `ipv4`, `ipv6`, `uuid`
- AnyOf
