import assert from 'node:assert/strict';

console.log('Testing Chinese Handwriting recognition integration...');

async function testHandwritingApi() {
  const width = 260;
  const height = 260;

  // Simulate strokes for the character "一" (horizontal stroke)
  const ink = [
    [
      [50, 100, 150, 200],
      [130, 130, 130, 130],
      [0, 50, 100, 150],
    ],
  ];

  const itc = 'zh-t-i0-handwrit';
  const url = `https://inputtools.google.com/request?itc=${itc}&app=translate`;
  const body = {
    app_version: 0.4,
    api_level: '537.36',
    device: '5',
    input_type: '0',
    options: 'enable_pre_space',
    requests: [
      {
        writing_guide: { writing_area_width: width, writing_area_height: height },
        pre_context: '',
        max_num_results: 10,
        max_completions: 0,
        language: 'zh_CN',
        ink,
      },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });

  assert.equal(response.status, 200, 'API response should be 200 OK');
  const data = (await response.json()) as any;
  assert.equal(data[0], 'SUCCESS', 'Response status should be SUCCESS');

  const candidates: string[] = data[1][0][1];
  console.log('Recognized candidates for horizontal stroke:', candidates);
  assert(candidates.includes('一'), 'Candidates must include "一"');

  console.log('Chinese Handwriting recognition test PASSED successfully!');
}

testHandwritingApi().catch((err) => {
  console.error('Handwriting test failed:', err);
  process.exit(1);
});
