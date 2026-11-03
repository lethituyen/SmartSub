import assert from 'assert';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import {
  areOcrModelsReady,
  getOcrModelPaths,
  getOcrWorkerPath,
  executeVideoOcrSubtitles,
  probeVideoOcrPreview,
} from '../../main/helpers/toolbox/videoOcrSubtitles';

async function runTests() {
  console.log('=== Running Video Hardsub OCR (PP-OCRv6) Tests ===');

  // 1. Worker and model path sanity
  const workerPath = getOcrWorkerPath();
  console.log('Worker path:', workerPath);
  assert(fs.existsSync(workerPath), 'Worker script should exist');

  const models = getOcrModelPaths();
  console.log('Model paths:', models);
  assert(fs.existsSync(models.detModel), 'det.onnx should exist');
  assert(fs.existsSync(models.recModel), 'rec.onnx should exist');
  assert(fs.existsSync(models.dictPath), 'dict.txt should exist');
  assert.strictEqual(areOcrModelsReady(), true, 'areOcrModelsReady() should return true');
  console.log('✓ Model paths and readiness verified');

  // 2. Generate a 2-second test video with hardsub text
  const testVideo = path.join(process.cwd(), 'test_hardsub_clip.mp4');
  const testSrt = path.join(process.cwd(), 'test_hardsub_clip.srt');

  try {
    execSync(
      `python -c "import cv2, numpy as np; fourcc = cv2.VideoWriter_fourcc(*'mp4v'); out = cv2.VideoWriter('${testVideo.replace(/\\/g, '/')}', fourcc, 25, (480, 270)); [out.write(cv2.putText(np.zeros((270, 480, 3), dtype=np.uint8) + 20, 'PPOCR Subtitle Test', (40, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)) for _ in range(50)]; out.release()"`,
    );
    assert(fs.existsSync(testVideo), 'Test video should be created');
    console.log('✓ Created synthetic test video');

    // 3. Test probeVideoOcrPreview
    const preview = await probeVideoOcrPreview(testVideo, 0.5, {
      ymin: 0.75,
      ymax: 0.98,
      xmin: 0.05,
      xmax: 0.95,
    });
    assert(preview.success, 'Preview should succeed');
    assert(preview.dataUri.startsWith('data:image/jpeg;base64,'), 'Data URI should be JPEG base64');
    console.log('✓ probeVideoOcrPreview succeeded (width:', preview.width, 'height:', preview.height, ')');

    // 4. Test executeVideoOcrSubtitles
    let progressReceived = false;
    const result = await executeVideoOcrSubtitles(
      {
        videoPath: testVideo,
        outputPath: testSrt,
        sampleFps: 2.5,
        minScore: 0.5,
        roi: { ymin: 0.75, ymax: 0.98, xmin: 0.05, xmax: 0.95 },
      },
      (p) => {
        progressReceived = true;
      },
    );

    assert(result.success, 'OCR extraction should succeed');
    assert(progressReceived, 'Progress callback should be triggered');
    assert(fs.existsSync(testSrt), 'Output SRT file should exist');

    const srtContent = fs.readFileSync(testSrt, 'utf-8');
    console.log('Extracted SRT content:\n' + srtContent);
    assert(srtContent.includes('PPOCR Subtitle Test') || srtContent.includes('Subtitle'), 'SRT should contain recognized text');
    console.log('✓ executeVideoOcrSubtitles extracted subtitles successfully');
  } finally {
    if (fs.existsSync(testVideo)) fs.unlinkSync(testVideo);
    if (fs.existsSync(testSrt)) fs.unlinkSync(testSrt);
  }

  console.log('🎉 All Video OCR Verification Tests Passed Successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
