import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { TTS_MODELS, isTtsModelInstalled } from '../../main/helpers/ttsModelCatalog';
import { localTtsLanguageError } from '../../types/ttsLanguage';
import {
  KOKORO_VIETNAMESE_VOICES,
  getKokoroViWorkerScript,
  getKokoroViModelsDir,
  isKokoroViEngineInstalled,
} from '../../main/helpers/kokoroVi/kokoroViManager';

async function runTests() {
  console.log('=== Running Kokoro-Vietnamese Integration Tests ===\n');

  // 1. Model Catalog Registration
  console.log('1. Checking TTS Catalog registration...');
  const spec = TTS_MODELS['kokoro-vietnamese'];
  assert(spec, 'kokoro-vietnamese must be registered in TTS_MODELS');
  assert.strictEqual(spec.id, 'kokoro-vietnamese');
  assert.strictEqual(spec.sampleRate, 24000);
  assert.strictEqual(spec.defaultVoiceId, 'diem_trinh');
  assert.deepStrictEqual(spec.languages, ['vi']);
  assert.strictEqual(spec.voices.length, 14);
  console.log('✓ Model catalog registered with 14 voices, 24kHz sample rate');

  // 2. Language Validation
  console.log('2. Checking Language support...');
  assert.strictEqual(localTtsLanguageError('kokoro-vietnamese', 'vi'), undefined);
  assert.strictEqual(localTtsLanguageError('kokoro-vietnamese', 'vi-VN'), undefined);
  assert.strictEqual(localTtsLanguageError('kokoro-vietnamese', 'zh'), 'zh');
  assert.strictEqual(localTtsLanguageError('kokoro-vietnamese', 'en'), 'en');
  console.log('✓ Language checks passed (accepts vi, rejects zh/en)');

  // 3. Worker script exists
  console.log('3. Checking worker script path...');
  const workerScript = getKokoroViWorkerScript();
  assert(fs.existsSync(workerScript), `Worker script must exist at: ${workerScript}`);
  console.log(`✓ Worker script verified: ${workerScript}`);

  // 4. Engine availability
  console.log('4. Checking Python engine availability...');
  const engineReady = await isKokoroViEngineInstalled();
  assert(engineReady, 'Python runtime must be available for Kokoro-Vietnamese');
  console.log('✓ Python runtime detected and ready');

  // 5. Voice spec consistency
  console.log('5. Checking 14 Vietnamese voices metadata...');
  for (const v of KOKORO_VIETNAMESE_VOICES) {
    assert(v.id, 'Voice must have id');
    assert(v.label, 'Voice must have label');
    assert(v.gender === 'f' || v.gender === 'm', 'Voice must have gender f or m');
    assert(
      v.region === 'north' || v.region === 'south' || v.region === 'central',
      'Voice must have valid region',
    );
  }
  // 6. Test Python worker invocation (--help)
  console.log('6. Testing Python worker CLI execution...');
  const { execFileSync } = await import('child_process');
  const { resolvePythonExecutable } = await import('../../main/helpers/toolbox/videoOcrSubtitles');
  const pyExe = await resolvePythonExecutable();
  const helpOutput = execFileSync(pyExe, [workerScript, '--help'], { encoding: 'utf-8' });
  assert(helpOutput.includes('--model-dir'), 'Help output must document --model-dir');
  assert(helpOutput.includes('--voice'), 'Help output must document --voice');
  assert(helpOutput.includes('--speed'), 'Help output must document --speed');
  console.log('✓ Python worker executed successfully and verified CLI interface');

  console.log('\n🎉 ALL Kokoro-Vietnamese integration tests passed successfully!');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
