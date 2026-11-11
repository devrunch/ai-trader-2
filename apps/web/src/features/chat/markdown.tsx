import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Assistant text as markdown: bold, lists, tables, code. Links open in a new tab; raw HTML is never rendered. */
export function ChatMarkdown({ text }: { text: string }) {
  return <div className="space-y-2 leading-relaxed [&_code]:bg-muted [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-auto [&_pre]:bg-muted [&_pre]:p-2 [&_strong]:font-semibold [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_td]:text-right [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:list-disc [&_ul]:pl-5">
    <Markdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer noopener" className="text-link underline">{children}</a> }}>{text}</Markdown>
  </div>;
}
