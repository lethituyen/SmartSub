const fs = require('fs');

const html = fs.readFileSync('scripts/hongguo_rank.html', 'utf8');

// Find the items around /detail?series_id=
const regex = /<a[^>]*href=["']\/detail\?series_id=(\d+)["'][^>]*>([\s\S]*?)<\/a>/g;
let m;
const items = [];
while ((m = regex.exec(html)) !== null) {
  const id = m[1];
  const inner = m[2];
  // extract text and img
  const imgMatch = inner.match(/src=["']([^"']+)["']/);
  const cleanText = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  items.push({
    id,
    cover: imgMatch ? imgMatch[1] : '',
    text: cleanText
  });
}

console.log('Parsed rank items count:', items.length);
console.log('First 5 parsed items:');
items.slice(0, 5).forEach((it, i) => {
  console.log(`[#${i + 1}] ID: ${it.id} | Cover: ${it.cover.slice(0, 50)}... | Text: ${it.text}`);
});
