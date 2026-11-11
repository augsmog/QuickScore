const hasWorkflowRun = (content) => /(?:https?:\/\/github\.com\/[^\s)]+\/actions\/runs\/\d+|\b(?:workflow\s+)?run\s*(?:id\s*[:#]?\s*)\d{6,})/i.test(content);

function validateReceipt(content) {
  const problems = [];
  if (!content.trim()) problems.push('file is empty');
  if (!/\b[0-9a-f]{40}\b/i.test(content)) problems.push('missing 40-hex SHA');
  if (!hasWorkflowRun(content)) problems.push('missing workflow run id or URL');
  return problems;
}

module.exports = { validateReceipt };
