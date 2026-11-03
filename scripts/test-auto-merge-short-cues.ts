import assert from 'node:assert/strict';
import {
  computeAutoMerge,
  secondsToTime,
  timeToSeconds,
} from '../renderer/lib/autoMergeShortCues';
import type { Subtitle } from '../renderer/hooks/useSubtitles';

console.log('Testing computeAutoMerge logic...');

// Test 1: Basic merge of two short cues
const subs1: Subtitle[] = [
  {
    id: '1',
    startEndTime: '00:00:01,000 --> 00:00:01,800',
    startTimeInSeconds: 1.0,
    endTimeInSeconds: 1.8,
    content: ['Xin chào'],
    sourceContent: 'Xin chào',
    speakerIds: [1],
    primarySpeakerId: 1,
  },
  {
    id: '2',
    startEndTime: '00:00:02,000 --> 00:00:03,500',
    startTimeInSeconds: 2.0,
    endTimeInSeconds: 3.5,
    content: ['các bạn đã đến với SmartSub'],
    sourceContent: 'các bạn đã đến với SmartSub',
    speakerIds: [1],
    primarySpeakerId: 1,
  },
  {
    id: '3',
    startEndTime: '00:00:05,000 --> 00:00:08,000',
    startTimeInSeconds: 5.0,
    endTimeInSeconds: 8.0,
    content: ['Đây là một câu độc lập rất dài'],
    sourceContent: 'Đây là một câu độc lập rất dài',
    speakerIds: [1],
    primarySpeakerId: 1,
  },
];

const res1 = computeAutoMerge(subs1, {
  maxShortDuration: 1.2,
  maxSilenceGap: 0.5,
  maxMergedDuration: 6.0,
  sameSpeakerOnly: true,
});

assert.equal(res1.mergedSubtitles.length, 2, 'Should reduce 3 cues to 2 cues');
assert.equal(res1.mergedCount, 1, 'Should have merged 1 cue away');
assert.equal(
  res1.mergedSubtitles[0].sourceContent,
  'Xin chào các bạn đã đến với SmartSub',
  'Content should be joined with a space',
);
assert.equal(
  res1.mergedSubtitles[0].startEndTime,
  '00:00:01,000 --> 00:00:03,500',
  'Start time should be 1.0 and end time 3.5',
);
assert.equal(res1.mergedSubtitles[0].id, '1');
assert.equal(res1.mergedSubtitles[1].id, '2');

// Test 2: Different speakers should NOT merge
const subs2: Subtitle[] = [
  {
    id: '1',
    startEndTime: '00:00:01,000 --> 00:00:01,800',
    startTimeInSeconds: 1.0,
    endTimeInSeconds: 1.8,
    content: ['Câu của người A'],
    sourceContent: 'Câu của người A',
    speakerIds: [1],
    primarySpeakerId: 1,
  },
  {
    id: '2',
    startEndTime: '00:00:02,000 --> 00:00:02,800',
    startTimeInSeconds: 2.0,
    endTimeInSeconds: 2.8,
    content: ['Câu của người B'],
    sourceContent: 'Câu của người B',
    speakerIds: [2],
    primarySpeakerId: 2,
  },
];

const res2 = computeAutoMerge(subs2, {
  maxShortDuration: 1.2,
  maxSilenceGap: 0.5,
  sameSpeakerOnly: true,
});

assert.equal(
  res2.mergedSubtitles.length,
  2,
  'Should NOT merge different speakers when sameSpeakerOnly is true',
);

// Test 3: Big gap should NOT merge
const subs3: Subtitle[] = [
  {
    id: '1',
    startEndTime: '00:00:01,000 --> 00:00:01,800',
    startTimeInSeconds: 1.0,
    endTimeInSeconds: 1.8,
    content: ['Câu 1'],
    sourceContent: 'Câu 1',
  },
  {
    id: '2',
    startEndTime: '00:00:03,500 --> 00:00:04,200',
    startTimeInSeconds: 3.5,
    endTimeInSeconds: 4.2,
    content: ['Câu 2'],
    sourceContent: 'Câu 2',
  },
];

const res3 = computeAutoMerge(subs3, {
  maxShortDuration: 1.2,
  maxSilenceGap: 0.5, // gap is 3.5 - 1.8 = 1.7s > 0.5s
});

assert.equal(
  res3.mergedSubtitles.length,
  2,
  'Should NOT merge across big silence gap',
);

// Test 4: Cascade merge of 3 small fragments
const subs4: Subtitle[] = [
  {
    id: '1',
    startEndTime: '00:00:01,000 --> 00:00:01,500',
    startTimeInSeconds: 1.0,
    endTimeInSeconds: 1.5,
    content: ['Tôi'],
    sourceContent: 'Tôi',
  },
  {
    id: '2',
    startEndTime: '00:00:01,600 --> 00:00:02,100',
    startTimeInSeconds: 1.6,
    endTimeInSeconds: 2.1,
    content: ['rất'],
    sourceContent: 'rất',
  },
  {
    id: '3',
    startEndTime: '00:00:02,200 --> 00:00:02,800',
    startTimeInSeconds: 2.2,
    endTimeInSeconds: 2.8,
    content: ['thích.'],
    sourceContent: 'thích.',
  },
];

const res4 = computeAutoMerge(subs4, {
  maxShortDuration: 1.2,
  maxSilenceGap: 0.5,
  maxMergedDuration: 6.0,
});

assert.equal(res4.mergedSubtitles.length, 1, 'Should cascade merge 3 fragments into 1 cue');
assert.equal(res4.mergedSubtitles[0].sourceContent, 'Tôi rất thích.');
assert.equal(res4.mergedSubtitles[0].startEndTime, '00:00:01,000 --> 00:00:02,800');

console.log('All computeAutoMerge tests PASSED successfully!');

