const axios = require('axios');

async function testKuaishou() {
  try {
    const res = await axios.post(
      'https://www.kuaishou.com/graphql',
      {
        operationName: 'visionHotRank',
        variables: { page: 'home' },
        query:
          'query visionHotRank($page: String) { visionHotRank(page: $page) { result items { name rank hotValue photoIds poster } } }',
      },
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Referer: 'https://www.kuaishou.com/',
          'Content-Type': 'application/json',
        },
        timeout: 8000,
      }
    );

    console.log('Kuaishou GraphQL Status:', res.status);
    const items = res.data?.data?.visionHotRank?.items || [];
    console.log('Items returned:', items.length);
    if (items.length > 0) {
      console.log('Top 3 Kuaishou items:', items.slice(0, 3));
    }
  } catch (e) {
    console.log('Kuaishou error:', e.message);
  }
}

testKuaishou();
