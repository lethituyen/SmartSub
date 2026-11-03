import assert from 'node:assert/strict';
import { buildComposePlan } from '../main/helpers/compose/composeCommandBuilder';

function run() {
  console.log('Testing Pipeline Compose with AntiDuplicate integration...');

  // 1. Test preset Balanced
  const planBalanced = buildComposePlan({
    videoPath: '/media/video.mp4',
    outputPath: '/media/out.mp4',
    subtitle: {
      mode: 'hard',
      filter: "subtitles='/media/video.srt'",
      encoderArgs: ['-c:v', 'libx264', '-crf', '20'],
      needsNv12: false,
      videoWidth: 1920,
      videoHeight: 1080,
      antiDuplicate: {
        enabled: true,
        preset: 'balanced',
      },
    },
    audio: { mode: 'keep' },
  });

  assert.ok(planBalanced.complexFilter, 'Should use complex filter for antiDuplicate');
  const complexStr = planBalanced.complexFilter.join(';');
  assert.ok(complexStr.includes('noise=alls=2:allf=t'), 'Should include dynamic noise');
  assert.ok(complexStr.includes('eq=contrast=1.02'), 'Should include color histogram shift');
  assert.ok(complexStr.includes('crop='), 'Should include micro-zoom crop');
  assert.ok(complexStr.includes('scale='), 'Should include micro-zoom scale');
  assert.ok(planBalanced.outputOptions.includes('-g'), 'Should include GOP scrambling -g');
  assert.ok(planBalanced.outputOptions.includes('-map_metadata'), 'Should include -map_metadata');
  assert.ok(complexStr.includes('asetrate='), 'Should include audio pitch shift asetrate');
  assert.ok(complexStr.includes('aresample='), 'Should include audio pitch shift aresample');
  console.log('✓ Preset balanced verified in compose plan!');

  // 2. Test preset Aggressive
  const planAggressive = buildComposePlan({
    videoPath: '/media/video.mp4',
    outputPath: '/media/out.mp4',
    subtitle: {
      mode: 'hard',
      filter: "subtitles='/media/video.srt'",
      encoderArgs: ['-c:v', 'libx264', '-crf', '20'],
      needsNv12: false,
      videoWidth: 1920,
      videoHeight: 1080,
      antiDuplicate: {
        enabled: true,
        preset: 'aggressive',
      },
    },
    audio: { mode: 'replace', trackPath: '/media/dub.wav' },
  });

  const aggComplex = planAggressive.complexFilter!.join(';');
  assert.ok(aggComplex.includes('hflip'), 'Should include mirror flip hflip');
  assert.ok(aggComplex.includes('vignette=PI/5'), 'Should include vignette');
  assert.ok(aggComplex.includes('noise=alls=3:allf=t'), 'Should include stronger noise level 3');
  assert.ok(aggComplex.includes('[1:a]asetrate='), 'Should apply pitch shift to replaced dubbing track');
  console.log('✓ Preset aggressive with dubbing replacement verified in compose plan!');

  // 3. Test with Watermark + Blur + AntiDuplicate simultaneously (Complete stack)
  const planFullStack = buildComposePlan({
    videoPath: '/media/video.mp4',
    outputPath: '/media/out.mp4',
    subtitle: {
      mode: 'hard',
      filter: "subtitles='/media/video.srt'",
      encoderArgs: ['-c:v', 'libx264', '-crf', '20'],
      needsNv12: false,
      videoWidth: 1920,
      videoHeight: 1080,
      blurOldSubtitles: { enabled: true, mode: 'auto' },
      watermark: { enabled: true, imagePath: '/media/logo.png', blurBackground: true },
      antiDuplicate: { enabled: true, preset: 'safe' },
    },
    audio: { mode: 'mix', trackPath: '/media/dub.wav', duckRatio: 10 },
  });

  const fullComplex = planFullStack.complexFilter!.join(';');
  assert.ok(fullComplex.includes('[v_remade]'), 'Base video transformed by anti-duplicate first');
  assert.ok(fullComplex.includes('boxblur='), 'Old subtitle blurred');
  assert.ok(fullComplex.includes('[wm_blur_patch]'), 'Logo background blurred');
  assert.ok(fullComplex.includes('[wm]overlay='), 'Logo overlaid');
  assert.ok(fullComplex.includes('sidechaincompress'), 'Audio duck mixed');
  console.log('✓ Full stack (AntiDuplicate + Blur + Logo + Subtitle + Audio Ducking) verified!');

  console.log('\nALL PIPELINE ANTI-DUPLICATE TESTS PASSED!');
}

run();
