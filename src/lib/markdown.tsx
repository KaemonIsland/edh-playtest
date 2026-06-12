import React from "react";

/**
 * Tiny markdown renderer for primers: #/##/### headings, **bold**, *italic*,
 * `code`, [links](url), -/* lists, and paragraphs. No HTML passthrough.
 */

function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // Tokenize bold, italics, code, links.
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key}>{m[4]}</em>);
    else if (m[6] !== undefined)
      out.push(
        <code key={key} className="rounded bg-stone-800 px-1 py-0.5 text-[0.9em]">
          {m[6]}
        </code>,
      );
    else if (m[8] !== undefined && m[9] !== undefined && /^https?:\/\//.test(m[9]))
      out.push(
        <a
          key={key}
          href={m[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
        >
          {m[8]}
        </a>,
      );
    else out.push(m[0]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  const lines = text.split(/\r?\n/);
  let list: string[] = [];
  let para: string[] = [];
  let key = 0;

  const flushList = () => {
    if (list.length > 0) {
      blocks.push(
        <ul key={key++} className="my-2 list-disc space-y-1 pl-5">
          {list.map((item, i) => (
            <li key={i}>{renderInline(item, `li-${key}-${i}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  const flushPara = () => {
    if (para.length > 0) {
      blocks.push(
        <p key={key++} className="my-2 leading-relaxed">
          {renderInline(para.join(" "), `p-${key}`)}
        </p>,
      );
      para = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    const listItem = line.match(/^[-*]\s+(.*)$/);
    if (heading) {
      flushList();
      flushPara();
      const level = heading[1]!.length;
      const cls =
        level === 1
          ? "mt-4 mb-2 text-lg font-bold text-stone-100"
          : level === 2
            ? "mt-3 mb-1.5 text-base font-bold text-stone-200"
            : "mt-2 mb-1 text-sm font-bold text-stone-300";
      blocks.push(
        React.createElement(
          `h${level + 2}`,
          { key: key++, className: cls },
          renderInline(heading[2]!, `h-${key}`),
        ),
      );
    } else if (listItem) {
      flushPara();
      list.push(listItem[1]!);
    } else if (line.trim() === "") {
      flushList();
      flushPara();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();

  return <div className="text-sm text-stone-300">{blocks}</div>;
}
