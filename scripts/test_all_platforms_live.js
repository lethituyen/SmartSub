const axios = require('axios');

const COMMON_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function testAllPlatforms() {
  console.log('=== TEST 1: HỒNG QUẢ (红果短剧) ===');
  try {
    const res = await axios.get('https://hongguoduanju.com/rank/hot-drama', {
      headers: { 'User-Agent': COMMON_UA, 'Referer': 'https://hongguoduanju.com/' },
      timeout: 8000
    });
    const html = res.data;
    const linkRegex = /<a[^>]*href=["']\/detail\?series_id=(\d+)["'][^>]*>([\s\S]*?)<\/a>/g;
    let match;
    const seenMap = new Map();
    while ((match = linkRegex.exec(html)) !== null) {
      const id = match[1];
      const inner = match[2];
      const imgMatch = inner.match(/src=["']([^"']+)["']/);
      const text = inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!seenMap.has(id)) seenMap.set(id, { id, cover: '', title: '' });
      const item = seenMap.get(id);
      if (imgMatch && !item.cover) item.cover = imgMatch[1];
      if (text && text.length > 1 && !/^\d+$/.test(text) && !item.title) item.title = text;
    }
    const list = Array.from(seenMap.values()).filter(x => x.title);
    console.log('Hongguo OK! Items:', list.length, 'Top 1:', list[0]);
  } catch (e) {
    console.log('Hongguo ERR:', e.message);
  }

  console.log('\n=== TEST 2: KUAISHOU (快手星芒短剧) ===');
  try {
    const res = await axios.post(
      'https://www.kuaishou.com/graphql',
      {
        operationName: 'visionHotRank',
        variables: { page: 'home' },
        query: 'query visionHotRank($page: String) { visionHotRank(page: $page) { result items { name rank hotValue photoIds poster } } }',
      },
      {
        headers: { 'User-Agent': COMMON_UA, Referer: 'https://www.kuaishou.com/', 'Content-Type': 'application/json' },
        timeout: 8000,
      }
    );
    const items = res.data?.data?.visionHotRank?.items || [];
    console.log('Kuaishou OK! Items:', items.length, 'Top 1:', items[0]?.name, 'Poster:', items[0]?.poster?.slice(0, 50));
  } catch (e) {
    console.log('Kuaishou ERR:', e.message);
  }

  console.log('\n=== TEST 3: DOUYIN (抖音热榜) ===');
  try {
    const res = await axios.get('https://aweme.snssdk.com/aweme/v1/hot/search/list/', {
      headers: { 'User-Agent': COMMON_UA },
      timeout: 6000
    });
    const words = res.data?.data?.word_list || [];
    console.log('Douyin OK! Items:', words.length, 'Top 1:', words[0]?.word, 'Cover:', words[0]?.word_cover?.url_list?.[0]?.slice(0, 50));
  } catch (e) {
    console.log('Douyin ERR:', e.message);
  }

  console.log('\n=== TEST 4: HÉMǍ (河马剧场 - Chiến thần/Tổng tài/Trọng sinh) ===');
  try {
    // AppleCMS query for short drama category with Dianzhong / Hema genre tags
    const res = await axios.get('https://cj.lziapi.com/api.php/provide/vod/?ac=detail&t=46&wd=' + encodeURIComponent('战神'), {
      headers: { 'User-Agent': COMMON_UA },
      timeout: 8000
    });
    const list = res.data?.list || [];
    console.log('Hema (Chiến thần) OK! Items:', list.length, 'Top 1:', list[0]?.vod_name, 'Cover:', list[0]?.vod_pic);
  } catch (e) {
    console.log('Hema ERR:', e.message);
  }

  console.log('\n=== TEST 5: XĪNGYÁ (星芽短剧 - Miễn phí/Đô thị/Nghịch tập) ===');
  try {
    const res = await axios.get('https://cj.lziapi.com/api.php/provide/vod/?ac=detail&t=46&wd=' + encodeURIComponent('神豪'), {
      headers: { 'User-Agent': COMMON_UA },
      timeout: 8000
    });
    const list = res.data?.list || [];
    console.log('Xingya (Thần hào/Nghịch tập) OK! Items:', list.length, 'Top 1:', list[0]?.vod_name, 'Cover:', list[0]?.vod_pic);
  } catch (e) {
    console.log('Xingya ERR:', e.message);
  }
}

testAllPlatforms();
