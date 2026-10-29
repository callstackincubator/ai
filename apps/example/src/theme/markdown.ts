import type { MarkdownStyle } from 'react-native-enriched-markdown'

// Markdown is drawn natively from plain color strings, so it cannot use
// PlatformColor and follows the color scheme itself
export function markdownStyle(scheme: 'light' | 'dark'): MarkdownStyle {
  const dark = scheme === 'dark'
  const label = dark ? '#FFFFFF' : '#000000'
  const secondary = dark ? '#EBEBF599' : '#3C3C4399'
  const fill = dark ? '#2C2C2E' : '#F2F2F7'
  return {
    paragraph: { fontSize: 17, lineHeight: 24, color: label },
    h1: { fontSize: 26, fontWeight: '700', color: label },
    h2: { fontSize: 22, fontWeight: '700', color: label },
    h3: { fontSize: 19, fontWeight: '600', color: label },
    strong: { color: label },
    link: { color: dark ? '#0A84FF' : '#007AFF' },
    list: { bulletColor: secondary, markerColor: secondary, color: label },
    blockquote: { borderColor: secondary, color: secondary },
    code: { color: label, backgroundColor: fill },
    codeBlock: { color: label, backgroundColor: fill, borderRadius: 12 },
  }
}
