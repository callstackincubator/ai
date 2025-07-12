import { foundationModels } from '@react-native-ai/apple';
import { z } from 'zod';

export async function basicStringDemo() {
  const schema = z
    .object({
      value: z.string().describe('A simple text string'),
    })
    .describe('String response');

  return await foundationModels.generateText(
    [{ role: 'user', content: 'Generate a city name' }],
    { schema }
  );
}

export async function colorEnumDemo() {
  const schema = z
    .object({
      color: z.enum(['red', 'blue', 'green']).describe('Pick a color'),
    })
    .describe('Color response');

  return await foundationModels.generateText(
    [{ role: 'user', content: 'What color is the grass?' }],
    { schema }
  );
}

export async function basicNumberDemo() {
  const schema = z
    .object({
      value: z.number().min(1).max(10).describe('A number between 1 and 10'),
    })
    .describe('Number response');

  return await foundationModels.generateText(
    [
      { role: 'system', content: 'There are 3 people in the room.' },
      { role: 'user', content: 'How many people are in the room?' },
    ],
    { schema }
  );
}

export async function basicBooleanDemo() {
  const schema = z
    .object({
      answer: z.boolean(),
    })
    .describe('Boolean response');

  return await foundationModels.generateText(
    [{ role: 'user', content: 'Is the sky blue?' }],
    { schema }
  );
}

export async function basicObjectDemo() {
  const schema = z
    .object({
      name: z.string().describe('Person name'),
      age: z.number().int().min(1).max(100).describe('Age'),
      active: z.boolean().describe('Is active'),
    })
    .describe('Basic person info');

  return await foundationModels.generateText(
    [{ role: 'user', content: 'Create a simple person' }],
    { schema }
  );
}

export async function basicArrayDemo() {
  const schema = z
    .object({
      items: z.array(z.string()).min(2).max(3).describe('List of items'),
    })
    .describe('Array response');

  return await foundationModels.generateText(
    [{ role: 'user', content: 'Random list of fruits' }],
    { schema, topK: 50, temperature: 1 }
  );
}

export async function stringFormatsDemo() {
  const schema = z
    .object({
      email: z.email(),
    })
    .describe('Contact with network info');

  return await foundationModels.generateText(
    [{ role: 'user', content: 'Create contact information for a user' }],
    { schema }
  );
}

export const schemaDemos = {
  basicString: { name: 'String', func: basicStringDemo },
  colorEnum: { name: 'Enum', func: colorEnumDemo },
  basicNumber: { name: 'Number', func: basicNumberDemo },
  basicBoolean: { name: 'Boolean', func: basicBooleanDemo },
  basicObject: { name: 'Object', func: basicObjectDemo },
  basicArray: { name: 'Array', func: basicArrayDemo },
  stringFormats: { name: 'String Formats', func: stringFormatsDemo },
};

export type DemoKey = keyof typeof schemaDemos;
