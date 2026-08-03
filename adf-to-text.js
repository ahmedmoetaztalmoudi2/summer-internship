const fs = require('fs');
const path = require('path');

/**
 * Converts Atlassian Document Format (ADF) JSON into clean Markdown/plain text.
 *
 * The LLM step needs stable business text, not raw ADF JSON. This converter keeps
 * Jira structure that matters for user stories: headings, lists, tables, panels,
 * tasks, decisions, mentions, links, statuses, dates, and code blocks.
 *
 * @param {Object|string|null|undefined} adfNode - ADF object, JSON string, or plain string from Jira API.
 * @returns {string} Clean Markdown/plain text representation.
 */
function adfToText(adfNode) {
  if (adfNode == null) return '';

  const node = parsePossibleJson(adfNode);

  if (typeof node === 'string') return normalizeWhitespace(node);
  if (Array.isArray(node)) return normalizeDocument(node.map(processNode).join('\n\n'));
  if (typeof node !== 'object') return String(node);

  if (!node.type && Array.isArray(node.content)) {
    return normalizeDocument(node.content.map(processNode).join('\n\n'));
  }

  if (!node.type) return normalizeWhitespace(extractObjectText(node));

  return normalizeDocument(processNode(node));
}

function parsePossibleJson(value) {
  if (typeof value !== 'string') return value;

  const trimmed = value.trim();
  if (!trimmed) return '';

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;

  try {
    return JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
}

function processNode(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(processNode).filter(Boolean).join('\n');
  if (typeof node !== 'object') return String(node);

  switch (node.type) {
    case 'doc':
      return joinBlocks(node.content);

    case 'paragraph':
      return joinInline(node.content);

    case 'heading': {
      const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
      const text = joinInline(node.content);
      return text ? `${'#'.repeat(level)} ${text}` : '';
    }

    case 'bulletList':
      return renderList(node.content, '-', 0);

    case 'orderedList':
      return renderList(node.content, node.attrs?.order || 1, 0);

    case 'listItem':
      return joinBlocks(node.content);

    case 'taskList':
      return renderTaskList(node.content);

    case 'taskItem':
      return renderTaskItem(node);

    case 'decisionList':
      return renderDecisionList(node.content);

    case 'decisionItem':
      return `Decision: ${joinBlocks(node.content)}`.trim();

    case 'codeBlock': {
      const language = node.attrs?.language || '';
      const text = joinInline(node.content);
      return `\`\`\`${language}\n${text}\n\`\`\``;
    }

    case 'blockquote':
      return joinBlocks(node.content)
        .split('\n')
        .map((line) => `> ${line}`.trimEnd())
        .join('\n');

    case 'panel': {
      const panelType = node.attrs?.panelType ? `Panel (${node.attrs.panelType})` : 'Panel';
      const body = joinBlocks(node.content);
      return body ? `${panelType}:\n${body}` : panelType;
    }

    case 'table':
      return renderTable(node.content);

    case 'tableRow':
      return renderTableRow(node.content);

    case 'tableHeader':
    case 'tableCell':
      return joinBlocks(node.content).replace(/\n+/g, '<br>');

    case 'rule':
      return '---';

    case 'text':
      return applyMarks(node.text || '', node.marks || []);

    case 'hardBreak':
      return '\n';

    case 'mention':
      return node.attrs?.text || node.attrs?.displayName || `@${node.attrs?.id || 'user'}`;

    case 'emoji':
      return node.attrs?.text || node.attrs?.shortName || '';

    case 'date':
      return formatDate(node.attrs?.timestamp);

    case 'status':
      return node.attrs?.text ? `[${node.attrs.text}]` : '';

    case 'inlineCard':
    case 'blockCard':
      return node.attrs?.url || '';

    case 'mediaSingle':
    case 'mediaGroup':
      return joinBlocks(node.content);

    case 'media':
      return renderMedia(node);

    case 'expand':
    case 'nestedExpand': {
      const title = node.attrs?.title || 'Expand';
      const body = joinBlocks(node.content);
      return body ? `${title}:\n${body}` : title;
    }

    case 'bodiedExtension':
    case 'extension':
    case 'inlineExtension':
      return renderExtension(node);

    default:
      if (Array.isArray(node.content)) return joinBlocks(node.content);
      return normalizeWhitespace(node.text || extractObjectText(node));
  }
}

function joinBlocks(content = []) {
  return content.map(processNode).map((text) => text.trim()).filter(Boolean).join('\n\n');
}

function joinInline(content = []) {
  return content.map(processNode).join('');
}

function renderList(content = [], marker, depth) {
  return content
    .map((item, index) => {
      const itemText = processNode(item).trim();
      const prefix = typeof marker === 'number' ? `${marker + index}.` : marker;
      return indentMultiline(`${prefix} ${itemText}`, depth);
    })
    .filter(Boolean)
    .join('\n');
}

function renderTaskList(content = []) {
  return content.map(processNode).filter(Boolean).join('\n');
}

function renderTaskItem(node) {
  const state = node.attrs?.state === 'DONE' ? 'x' : ' ';
  const text = joinInline(node.content).trim();
  return `- [${state}] ${text}`.trimEnd();
}

function renderDecisionList(content = []) {
  return content.map(processNode).filter(Boolean).join('\n');
}

function renderTable(rows = []) {
  const renderedRows = rows.map(processNode).filter(Boolean);
  if (renderedRows.length === 0) return '';

  const columnCount = renderedRows[0].split('|').length - 2;
  const separator = `| ${Array.from({ length: columnCount }).map(() => '---').join(' | ')} |`;
  return [renderedRows[0], separator, ...renderedRows.slice(1)].join('\n');
}

function renderTableRow(cells = []) {
  const values = cells.map(processNode).map((cell) => cell.replace(/\|/g, '\\|').trim());
  return `| ${values.join(' | ')} |`;
}

function renderMedia(node) {
  const attrs = node.attrs || {};
  const label = attrs.alt || attrs.collection || attrs.type || 'media';
  const id = attrs.id ? ` ${attrs.id}` : '';
  return `[${label}${id}]`;
}

function renderExtension(node) {
  const attrs = node.attrs || {};
  const label = attrs.text || attrs.extensionTitle || attrs.extensionKey || attrs.extensionType || node.type;
  const body = joinBlocks(node.content);
  return body ? `${label}:\n${body}` : `[${label}]`;
}

function applyMarks(value, marks) {
  let text = value;

  for (const mark of marks) {
    if (mark.type === 'link' && mark.attrs?.href) {
      text = `[${text}](${mark.attrs.href})`;
    } else if (mark.type === 'code') {
      text = `\`${text}\``;
    } else if (mark.type === 'strong') {
      text = `**${text}**`;
    } else if (mark.type === 'em') {
      text = `*${text}*`;
    } else if (mark.type === 'strike') {
      text = `~~${text}~~`;
    }
  }

  return text;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.getTime())) return String(timestamp);
  return date.toISOString().slice(0, 10);
}

function indentMultiline(text, depth) {
  const indent = '  '.repeat(depth);
  return text
    .split('\n')
    .map((line, index) => (index === 0 ? `${indent}${line}` : `${indent}  ${line}`))
    .join('\n');
}

function normalizeDocument(text) {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeWhitespace(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

function extractObjectText(value) {
  const parts = [];

  function visit(current) {
    if (current == null) return;
    if (typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      parts.push(String(current));
      return;
    }
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (typeof current === 'object') {
      if (typeof current.text === 'string') parts.push(current.text);
      if (Array.isArray(current.content)) current.content.forEach(visit);
    }
  }

  visit(value);
  return parts.join(' ');
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function runCli() {
  const inputPath = process.argv[2];
  const input = inputPath
    ? fs.readFileSync(path.resolve(process.cwd(), inputPath), 'utf8')
    : await readStdin();

  process.stdout.write(`${adfToText(input)}\n`);
}

module.exports = { adfToText };

if (require.main === module) {
  runCli().catch((err) => {
    console.error(`ADF conversion failed: ${err.message}`);
    process.exit(1);
  });
}
