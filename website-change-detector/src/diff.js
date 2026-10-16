function diffLines(oldText = '', newText = '') {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  // LCS dynamic programming is simple and adequate for page text snapshots.
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ type: 'same', text: a[i++] }); j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ type: 'removed', text: a[i++] });
    else out.push({ type: 'added', text: b[j++] });
  }
  while (i < a.length) out.push({ type: 'removed', text: a[i++] });
  while (j < b.length) out.push({ type: 'added', text: b[j++] });
  return out;
}
function summarizeDiff(diff) {
  const added = diff.filter(x => x.type === 'added').length;
  const removed = diff.filter(x => x.type === 'removed').length;
  return `${added} line(s) added, ${removed} line(s) removed`;
}
module.exports = { diffLines, summarizeDiff };
