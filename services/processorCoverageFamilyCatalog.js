'use strict';

const DEFINITIONS = Object.freeze([
  { brandName: 'Intel', code: 'intel-i3-4th-gen', name: 'Intel i3-4th Gen', exportShortForm: 'i3-4th', description: 'Intel Core i3 4th generation processors.', sortOrder: 1 },
  { brandName: 'Intel', code: 'intel-i5-4th-gen', name: 'Intel i5-4th Gen', exportShortForm: 'i5-4th', description: 'Intel Core i5 4th generation processors.', sortOrder: 2 },
  { brandName: 'Intel', code: 'intel-i7-4th-gen', name: 'Intel i7-4th Gen', exportShortForm: 'i7-4th', description: 'Intel Core i7 4th generation processors.', sortOrder: 3 },
  { brandName: 'Intel', code: 'intel-i3-14th-gen', name: 'Intel i3-14th Gen', exportShortForm: 'i3-14th', description: 'Intel Core i3 14th generation processors.', sortOrder: 34 },
  { brandName: 'Intel', code: 'intel-i5-14th-gen', name: 'Intel i5-14th Gen', exportShortForm: 'i5-14th', description: 'Intel Core i5 14th generation processors.', sortOrder: 35 },
  { brandName: 'Intel', code: 'intel-i7-14th-gen', name: 'Intel i7-14th Gen', exportShortForm: 'i7-14th', description: 'Intel Core i7 14th generation processors.', sortOrder: 36 },
  { brandName: 'Intel', code: 'intel-i9-8th-gen', name: 'Intel i9-8th Gen', exportShortForm: 'i9-8th', description: 'Intel Core i9 8th generation processors.', sortOrder: 37 },
  { brandName: 'Intel', code: 'intel-i9-9th-gen', name: 'Intel i9-9th Gen', exportShortForm: 'i9-9th', description: 'Intel Core i9 9th generation processors.', sortOrder: 38 },
  { brandName: 'Intel', code: 'intel-i9-10th-gen', name: 'Intel i9-10th Gen', exportShortForm: 'i9-10th', description: 'Intel Core i9 10th generation processors.', sortOrder: 39 },
  { brandName: 'Intel', code: 'intel-i9-12th-gen', name: 'Intel i9-12th Gen', exportShortForm: 'i9-12th', description: 'Intel Core i9 12th generation processors.', sortOrder: 40 },
  { brandName: 'Intel', code: 'intel-i9-13th-gen', name: 'Intel i9-13th Gen', exportShortForm: 'i9-13th', description: 'Intel Core i9 13th generation processors.', sortOrder: 41 },
  { brandName: 'Intel', code: 'intel-core-m3-8th-gen', name: 'Intel Core m3-8th Gen', exportShortForm: 'm3-8th', description: 'Intel Core m3 8th generation processors.', sortOrder: 101 },
  { brandName: 'Intel', code: 'intel-processor-n-series', name: 'Intel Processor N-Series', exportShortForm: 'N-Series', description: 'Intel Processor N-series processors.', sortOrder: 109 },
  { brandName: 'Intel', code: 'intel-pentium-gold', name: 'Intel Pentium Gold', exportShortForm: 'Pentium Gold', description: 'Intel Pentium Gold processors.', sortOrder: 112 },
  { brandName: 'Intel', code: 'intel-core-ultra-9-series-1', name: 'Intel Core Ultra 9 Series 1', exportShortForm: 'Ultra 9-S1', description: 'Intel Core Ultra 9 processors with 1xx model numbers.', sortOrder: 124 },
  { brandName: 'Intel', code: 'intel-xeon-mobile-6th-gen', name: 'Intel Xeon Mobile 6th Gen', exportShortForm: 'Xeon-6th', description: 'Intel mobile Xeon processors aligned with 6th generation Core platforms.', sortOrder: 130 },
  { brandName: 'Intel', code: 'intel-xeon-mobile-7th-gen', name: 'Intel Xeon Mobile 7th Gen', exportShortForm: 'Xeon-7th', description: 'Intel mobile Xeon processors aligned with 7th generation Core platforms.', sortOrder: 131 },
  { brandName: 'Intel', code: 'intel-xeon-mobile-8th-gen', name: 'Intel Xeon Mobile 8th Gen', exportShortForm: 'Xeon-8th', description: 'Intel mobile Xeon processors aligned with 8th generation Core platforms.', sortOrder: 132 },
  { brandName: 'Intel', code: 'intel-xeon-mobile-9th-gen', name: 'Intel Xeon Mobile 9th Gen', exportShortForm: 'Xeon-9th', description: 'Intel mobile Xeon processors aligned with 9th generation Core platforms.', sortOrder: 133 },
  { brandName: 'Intel', code: 'intel-xeon-mobile-10th-gen', name: 'Intel Xeon Mobile 10th Gen', exportShortForm: 'Xeon-10th', description: 'Intel mobile Xeon processors aligned with 10th generation Core platforms.', sortOrder: 134 },
  { brandName: 'Intel', code: 'intel-xeon-mobile-11th-gen', name: 'Intel Xeon Mobile 11th Gen', exportShortForm: 'Xeon-11th', description: 'Intel mobile Xeon processors aligned with 11th generation Core platforms.', sortOrder: 135 },
  { brandName: 'AMD', code: 'amd-pro-a10-6th-gen', name: 'AMD PRO A10 6th Gen', exportShortForm: 'PRO A10-6th', description: '6th generation AMD PRO A10 mobile processors.', sortOrder: 199 },
  { brandName: 'AMD', code: 'amd-ryzen-9-4000-series', name: 'AMD Ryzen 9 4000 Series', exportShortForm: 'R9-4000', description: 'AMD Ryzen 9 4000-series processors.', sortOrder: 230 },
  { brandName: 'AMD', code: 'amd-ryzen-9-5000-series', name: 'AMD Ryzen 9 5000 Series', exportShortForm: 'R9-5000', description: 'AMD Ryzen 9 5000-series processors.', sortOrder: 231 },
  { brandName: 'AMD', code: 'amd-ryzen-9-7000-series', name: 'AMD Ryzen 9 7000 Series', exportShortForm: 'R9-7000', description: 'AMD Ryzen 9 7000-series processors.', sortOrder: 232 },
  { brandName: 'AMD', code: 'amd-ryzen-9-8000-series', name: 'AMD Ryzen 9 8000 Series', exportShortForm: 'R9-8000', description: 'AMD Ryzen 9 8000-series processors.', sortOrder: 233 },
  { brandName: 'Qualcomm', code: 'qualcomm-microsoft-sq', name: 'Microsoft SQ', exportShortForm: 'Microsoft SQ', description: 'Microsoft SQ ARM processors developed with Qualcomm.', sortOrder: 330 }
].map((definition) => Object.freeze(definition)));

const byCode = new Map(DEFINITIONS.map((definition) => [definition.code, definition]));

function getProcessorCoverageFamilyDefinition(code) {
  return byCode.get(String(code || '').trim()) || null;
}

function listProcessorCoverageFamilyDefinitions() {
  return DEFINITIONS.slice();
}

module.exports = {
  getProcessorCoverageFamilyDefinition,
  listProcessorCoverageFamilyDefinitions
};
