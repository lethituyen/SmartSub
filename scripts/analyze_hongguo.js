const fs = require('fs');

const html = fs.readFileSync('scripts/hongguo_home.html', 'utf8');
const hrefs = [];
const regex = /href=["']([^"']+)["']/g;
let m;
while ((m = regex.exec(html)) !== null) {
  hrefs.push(m[1]);
}
console.log('Unique hrefs sample:', [...new Set(hrefs)].slice(0, 30));

// Check if there is NEXT_DATA or window.__INITIAL_STATE__ or json in html:
const jsonScriptRegex = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
const nextMatch = html.match(jsonScriptRegex);
if (nextMatch) {
  console.log('Found __NEXT_DATA__! Length:', nextMatch[1].length);
  try {
    const data = JSON.parse(nextMatch[1]);
    console.log('Next.js pageProps keys:', Object.keys(data.props?.pageProps || {}));
  } catch (e) {
    console.log('JSON parse err:', e.message);
  }
} else {
  // Check for any other JSON or script data
  const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
  let sm;
  while ((sm = scriptRegex.exec(html)) !== null) {
    if (sm[1].includes('data') || sm[1].includes('list') || sm[1].includes('drama')) {
      console.log('Script with data snippet:', sm[1].slice(0, 200));
    }
  }
}
