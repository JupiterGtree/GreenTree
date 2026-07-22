import type { ReactNode } from "react";

export function SafeMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      index += 1;
      blocks.push(
        <pre key={blocks.length} className="my-6 overflow-x-auto rounded-md border border-gt-border bg-gt-black p-4">
          <code data-language={language || undefined}>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    if (heading) {
      const content = inline(heading[2]);
      const className = "mb-3 mt-8 font-display font-semibold text-gt-offwhite";
      const level = heading[1].length;
      blocks.push(level === 1
        ? <h1 key={blocks.length} className={`${className} text-3xl`}>{content}</h1>
        : level === 2
          ? <h2 key={blocks.length} className={`${className} text-2xl`}>{content}</h2>
          : level === 3
            ? <h3 key={blocks.length} className={`${className} text-xl`}>{content}</h3>
            : <h4 key={blocks.length} className={`${className} text-lg`}>{content}</h4>);
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index++].replace(/^>\s?/, ""));
      }
      blocks.push(
        <blockquote key={blocks.length} className="my-6 border-l-2 border-gt-emerald px-5 italic text-gt-muted">
          {inline(quote.join(" "))}
        </blockquote>,
      );
      continue;
    }
    const list = /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(line);
    if (list) {
      const ordered = /\d+\./.test(list[2]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = /^(\s*)([-*+]|\d+\.)\s+(.+)$/.exec(lines[index]);
        if (!match || /\d+\./.test(match[2]) !== ordered) break;
        items.push(match[3]);
        index += 1;
      }
      const children = items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>);
      blocks.push(ordered
        ? <ol key={blocks.length} className="my-5 list-decimal space-y-2 pl-6">{children}</ol>
        : <ul key={blocks.length} className="my-5 list-disc space-y-2 pl-6">{children}</ul>);
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length
      && lines[index].trim()
      && !/^(#{1,4})\s|^```|^>\s?|^(\s*)([-*+]|\d+\.)\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index++]);
    }
    blocks.push(<p key={blocks.length} className="my-5 leading-8 text-gt-fg">{inline(paragraph.join(" "))}</p>);
  }

  return <div className="news-markdown">{blocks}</div>;
}

function inline(value: string): ReactNode[] {
  const token = /(!?\[[^\]]*]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*)/g;
  const parts = value.split(token);
  return parts.map((part, index) => {
    const image = /^!\[([^\]]*)]\(([^)]+)\)$/.exec(part);
    if (image) {
      const src = safeUrl(image[2], true);
      return src
        ? <img key={index} src={src} alt={image[1]} loading="lazy" className="my-6 max-h-[36rem] w-full rounded-lg object-cover" />
        : <span key={index}>{image[1]}</span>;
    }
    const link = /^\[([^\]]*)]\(([^)]+)\)$/.exec(part);
    if (link) {
      const href = safeUrl(link[2], false);
      return href
        ? <a key={index} href={href} rel={href.startsWith("http") ? "noopener noreferrer" : undefined} className="text-gt-emerald-bright underline underline-offset-4">{link[1]}</a>
        : <span key={index}>{link[1]}</span>;
    }
    if (/^`[^`]+`$/.test(part)) {
      return <code key={index} className="rounded bg-gt-black px-1.5 py-0.5 font-mono text-sm">{part.slice(1, -1)}</code>;
    }
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}

export function safeMarkdownUrl(value: string, image = false): string | null {
  return safeUrl(value, image);
}

function safeUrl(value: string, image: boolean): string | null {
  const clean = value.trim();
  if (clean.startsWith("/") && !clean.startsWith("//")) return clean;
  try {
    const url = new URL(clean);
    const protocols = image ? ["https:"] : ["https:", "http:", "mailto:"];
    return protocols.includes(url.protocol) ? clean : null;
  } catch {
    return null;
  }
}
