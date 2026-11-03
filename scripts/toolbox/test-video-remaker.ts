import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { executeVideoRemake } from '../../main/helpers/toolbox/videoRemaker';

async function run() {
  console.log('Testing videoRemaker execution with synthetic video...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'smartsub-test-remaker-'));
  const testInput = path.join(tmpDir, 'input.mp4');

  // Generate 2s dummy video with test tone
  const genResult = spawnSync(ffmpegStatic as string, [
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=25',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=2',
    '-c:v', 'libx264', '-c:a', 'aac',
    '-y', testInput
  ]);

  if (!fs.existsSync(testInput)) {
    throw new Error('Failed to create test input video: ' + genResult.stderr?.toString());
  }

  console.log('1. Testing preset "safe"...');
  let progressCalled = false;
  const resultSafe = await executeVideoRemake(
    {
      videoPath: testInput,
      preset: 'safe',
      outputDir: tmpDir,
    },
    'job-test-safe',
    (pct) => {
      if (pct > 0) progressCalled = true;
    }
  );

  console.log('Result safe:', resultSafe);
  assert.ok(resultSafe.success, 'Result safe should be successful');
  assert.ok(fs.existsSync(resultSafe.outputPath), 'Output file should exist');
  assert.ok(progressCalled, 'Progress callback should have been called');
  console.log('✓ Preset safe succeeded:', resultSafe.outputPath);

  console.log('2. Testing preset "aggressive" with all options enabled...');
  const resultAggressive = await executeVideoRemake(
    {
      videoPath: testInput,
      preset: 'aggressive',
      outputDir: tmpDir,
      microZoomPercent: 4,
      mirrorFlip: true,
      microNoise: true,
      microNoiseStrength: 3,
      colorShift: true,
      vignette: true,
      speedMultiplier: 1.05,
      pitchShift: true,
      pitchSemitones: 0.5,
      randomGop: true,
      clearMetadata: true,
    },
    'job-test-aggressive',
    (pct) => {}
  );

  console.log('Result aggressive:', resultAggressive);
  assert.ok(resultAggressive.success, 'Result aggressive should be successful');
  assert.ok(fs.existsSync(resultAggressive.outputPath), 'Aggressive output file should exist');
  console.log('✓ Preset aggressive succeeded:', resultAggressive.outputPath);

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('ALL TESTS PASSED!');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
