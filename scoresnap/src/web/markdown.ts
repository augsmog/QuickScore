function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Inline markdown after the source has been HTML-escaped, except code spans. */
function inline(source: string) {
  const codes: string[] = [];
  const marked = source.replace(/`([^`]+)`/g, (_match, code: string) => {
    codes.push(code);
    return `\u0000${codes.length - 1}\u0000`;
  });
  let html = escapeHtml(marked);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/https:\/\/[^\s<&"]+/g, (url) => {
    const trimmed = url.replace(/[.,;:)]+$/g, "");
    return `<a href="${trimmed}">${trimmed}</a>${url.slice(trimmed.length)}`;
  });
  html = html.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, (email) => {
    return `<a href="mailto:${email}">${email}</a>`;
  });
  return html.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => {
    return `<code>${escapeHtml(codes[Number(index)])}</code>`;
  });
}

function isTableLine(line: string) {
  return line.trim().startsWith("|");
}

function isDivider(line: string) {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function cells(line: string) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function table(lines: string[]) {
  const header = cells(lines[0]);
  const body = lines.slice(2).map(cells);
  const head = `<tr>${header.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr>`;
  const rows = body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`).join("");
  return `<div class="policy-table"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>`;
}

/** Convert the verified privacy-policy markdown to HTML. No scripts are emitted. */
export function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const blocks: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6}) (.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2];
      blocks.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (isTableLine(line) && index + 1 < lines.length && isDivider(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && isTableLine(lines[index]) && !isDivider(lines[index])) {
        tableLines.push(lines[index]);
        index += 1;
      }
      blocks.push(table(tableLines));
      continue;
    }

    if (/^- /.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^- /.test(lines[index])) {
        items.push(`<li>${inline(lines[index].slice(2))}</li>`);
        index += 1;
      }
      blocks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\. /.test(lines[index])) {
        items.push(`<li>${inline(lines[index].replace(/^\d+\. /, ""))}</li>`);
        index += 1;
      }
      blocks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^(#{1,6}) /.test(lines[index]) &&
      !/^- /.test(lines[index]) &&
      !/^\d+\. /.test(lines[index]) &&
      !isTableLine(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}
