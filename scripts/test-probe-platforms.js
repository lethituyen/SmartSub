const axios = require('axios');
const fs = require('fs');

async function probe() {
  console.log('=== 1. HỒNG QUẢ (红果短剧) ===');
  try {
    const res = await axios.get('https://hongguoduanju.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    console.log('Hongguo web status:', res.status, 'HTML length:', res.data.length);
    // Extract series cards: typically contains /player/{id} and img, title
    const regex = /<a[^>]*href=["']\/player\/(\d+)["'][^>]*>([\s\S]*?)<\/a>/g;
    let match;
    const hongguoList = [];
    while ((match = regex.exec(res.data)) !== null && hongguoList.length < 15) {
      const id = match[1];
      const inner = match[2];
      const titleMatch = inner.match(/<p[^>]*class=["'][^"']*title[^"']*["'][^>]*>([^<]+)<\/p>/) ||
                         inner.match(/<h\d[^>]*>([^<]+)<\/h\d>/) ||
                         inner.match(/alt=["']([^"']+)["']/);
      const imgMatch = inner.match(/src=["']([^"']+)["']/);
      const text = titleMatch ? titleMatch[1].trim() : inner.replace(/<[^>]+>/g, '').trim();
      if (text && text.length > 1 && !text.includes('播放')) {
        hongguoList.push({
          id,
          title: text,
          cover: imgMatch ? imgMatch[1] : '',
          link: `https://hongguoduanju.com/player/${id}`
        });
      }
    }
    console.log('Hongguo parsed dramas count:', hongguoList.length);
    if (hongguoList.length > 0) {
      console.log('Sample Hongguo item:', hongguoList[0]);
    }
  } catch (e) {
    console.log('Hongguo error:', e.message);
  }

  console.log('\n=== 2. HÉMǍ (河马剧场 - kuaikaw.cn) ===');
  try {
    const res = await axios.get('https://www.kuaikaw.cn/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    console.log('Kuaikaw status:', res.status, 'HTML length:', res.data.length);
    // Find drama items or API endpoints in script tags
    const scriptMatches = res.data.match(/src=["']([^"']+\.js[^"']*)["']/g) || [];
    console.log('Kuaikaw scripts:', scriptMatches.slice(0, 5));
    // Find links or drama titles
    const links = (res.data.match(/href=["']([^"']+)["']/g) || []).slice(0, 10);
    console.log('Kuaikaw links:', links);
  } catch (e) {
    console.log('Kuaikaw error:', e.message);
  }

  console.log('\n=== 3. XĪNGYÁ (星芽短剧 - xingya.com.cn) ===');
  try {
    const res = await axios.get('https://www.xingya.com.cn/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    console.log('Xingya status:', res.status, 'HTML length:', res.data.length);
    const links = (res.data.match(/href=["']([^"']+)["']/g) || []).slice(0, 10);
    console.log('Xingya links:', links);
  } catch (e) {
    console.log('Xingya error:', e.message);
  }

  console.log('\n=== 4. DOUYIN BILLBOARD (抖音热榜) ===');
  try {
    const res = await axios.get('https://aweme.snssdk.com/aweme/v1/hot/search/list/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 6000
    });
    const words = res.data?.data?.word_list || [];
    console.log('Douyin status:', res.status, 'Count:', words.length);
    if (words.length > 0) {
      console.log('Top 3 Douyin:', words.slice(0, 3).map(w => ({
        word: w.word,
        hot: w.hot_value,
        cover: w.word_cover?.url_list?.[0]
      })));
    }
  } catch (e) {
    console.log('Douyin error:', e.message);
  }
}

probe();
