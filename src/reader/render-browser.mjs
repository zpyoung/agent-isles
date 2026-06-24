// Client-side Markdown renderer for the reader. Runs the same unified pipeline
// as the Node renderer (src/render.mjs) minus the Node-only steps: D2 diagram
// rendering (needs the d2 binary / WASM), writeback metadata, and source
// task-marker collection. Bundled for the browser via Rollup into the reader
// SPA, so a desktop/Tauri shell or a plain browser can render locally without a
// server-side render step. Mermaid still renders in the browser as today.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeHighlight from 'rehype-highlight';
import rehypeStringify from 'rehype-stringify';

import {
  rehypeAgentMermaid,
  rehypeAgentFlow,
  rehypeAgentTable,
  rehypeAgentHeadingAnchors,
} from '../renderer/rehype-islands.mjs';

// Render a Markdown string to trusted HTML body + a heading table-of-contents.
// Trusted mode mirrors the current `isles live` behavior: the user is reading
// their own local files, and raw HTML islands (Bootstrap markup, <agent-*>
// elements) must pass through. Returns { html, toc } where toc is an array of
// { id, text, level } for levels 1–3.
export async function renderReaderMarkdown(markdown) {
  const toc = [];
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeAgentMermaid)
    .use(rehypeAgentFlow)
    .use(rehypeAgentTable, { warn: () => {} })
    .use(rehypeRaw)
    .use(rehypeAgentHeadingAnchors, { toc })
    .use(rehypeHighlight)
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(String(markdown ?? ''));

  return { html: String(file), toc };
}
