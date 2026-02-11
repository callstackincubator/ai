# Prior Art

[json-render](https://github.com/vercel-labs/json-render) is an alternative that predates this library. It provides React and React Native integration and works with the [AI SDK](https://github.com/vercel/ai). Its design:

- The LLM **streams** the UI in a predefined format; a stream parser consumes the output.
- A **long system prompt** describes that format and includes examples.

That works well for **large language models** (e.g. cloud APIs). For **on-device, small models** (e.g. Apple Foundation Models with limited context), you run into:

1. **Context size** — Small models often have 4K-token windows (such as Apple Foundation having a 4096 token limit). A long system prompt plus conversation leaves little room; you end up summarizing or truncating, if you even fit into the window at all.
2. **Task complexity** — json-render supports rich actions and state. For small models (e.g. 3B parameters), generating a correct static UI is already hard; a simpler, tool-based flow is more reliable.

## How this package differs

- **Tool calling instead of streaming UI** — The model emits small JSON payloads by calling tools (add node, set props, etc.). Each step is small and easier for the model to get right.
- **Narrower feature set** — Focus on static UI building first, so smaller models can complete the task. More features will be added later.

Choose **@react-native-ai/json-ui** when you run small models on-device; consider **json-render** when using cloud providers or larger models.
