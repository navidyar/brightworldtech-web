'use strict';

const { getProcessorMetadata } = require('./processorMetadataCatalog');

const GROUPS = Object.freeze({
  intel4Desktop: ['i3-4130', 'i5-4570', 'i7-4770'],
  intel4DesktopT: ['i3-4130T', 'i5-4570T', 'i7-4770T'],
  intel6Desktop: ['i3-6100', 'i5-6500', 'i7-6700'],
  intel6DesktopT: ['i3-6100T', 'i5-6500T', 'i7-6700T'],
  intel7Desktop: ['i3-7100', 'i5-7500', 'i7-7700'],
  intel7DesktopT: ['i3-7100T', 'i5-7500T', 'i7-7700T'],
  intel8Desktop: ['i3-8100', 'i5-8500', 'i7-8700'],
  intel8DesktopT: ['i3-8100T', 'i5-8500T', 'i7-8700T'],
  intel9Desktop: ['i3-9100', 'i5-9500', 'i7-9700'],
  intel9DesktopT: ['i3-9100T', 'i5-9500T', 'i7-9700T'],
  intel10Desktop: ['i3-10100', 'i5-10500', 'i7-10700'],
  intel10DesktopT: ['i3-10100T', 'i5-10500T', 'i7-10700T'],
  intel11Desktop: ['i5-11500', 'i7-11700'],
  intel11DesktopT: ['i5-11500T', 'i7-11700T'],
  intel12Desktop: ['i3-12100', 'i5-12500', 'i7-12700'],
  intel12DesktopT: ['i3-12100T', 'i5-12500T', 'i7-12700T'],
  intel13Desktop: ['i3-13100', 'i5-13500', 'i7-13700'],
  intel13DesktopT: ['i3-13100T', 'i5-13500T', 'i7-13700T'],
  intel14Desktop: ['i3-14100', 'i5-14500', 'i7-14700'],
  intel14DesktopT: ['i3-14100T', 'i5-14500T', 'i7-14700T'],

  intel6U: ['i5-6200U', 'i5-6300U', 'i7-6600U'],
  intel7U: ['i5-7200U', 'i5-7300U', 'i7-7600U'],
  intel8U: ['i5-8250U', 'i5-8350U', 'i7-8650U'],
  intel8RefreshU: ['i5-8265U', 'i5-8365U', 'i7-8665U'],
  intel10U: ['i5-10210U', 'i5-10310U', 'i7-10610U'],
  intel11U: ['i5-1135G7', 'i5-1145G7', 'i7-1185G7'],
  intel12U: ['i5-1235U', 'i5-1245U', 'i7-1265U'],
  intel13U: ['i5-1335U', 'i5-1345U', 'i7-1365U'],
  intelUltraU: ['Core Ultra 5 125U', 'Core Ultra 5 135U', 'Core Ultra 7 165U'],
  intelUltra2U: ['Core Ultra 5 225U', 'Core Ultra 7 255U'],

  intel6H: ['i5-6300HQ', 'i7-6820HQ', 'Xeon E3-1505M v5'],
  intel7H: ['i5-7300HQ', 'i7-7820HQ', 'Xeon E3-1505M v6'],
  intel8H: ['i5-8400H', 'i7-8850H', 'Xeon E-2176M'],
  intel9H: ['i5-9300H', 'i7-9850H', 'Xeon E-2276M'],
  intel10H: ['i5-10400H', 'i7-10850H', 'Xeon W-10855M'],
  intel11H: ['i5-11400H', 'i7-11800H', 'Xeon W-11955M'],
  intel12H: ['i5-12500H', 'i7-12700H', 'i9-12900H'],
  intel13H: ['i5-13500H', 'i7-13700H', 'i9-13900H'],
  intelUltraH: ['Core Ultra 5 135H', 'Core Ultra 7 155H', 'Core Ultra 9 185H'],

  amd3ProU: ['Ryzen 5 PRO 3500U', 'Ryzen 7 PRO 3700U'],
  amd3U: ['Ryzen 3 3250U', 'Ryzen 5 3500U'],
  amd4H: ['Ryzen 5 4600H', 'Ryzen 7 4800H', 'Ryzen 9 4900HS'],
  amd5H: ['Ryzen 5 5600H', 'Ryzen 7 5800H', 'Ryzen 9 5900HS'],
  amd6And7H: ['Ryzen 7 6800HS', 'Ryzen 7 7735HS', 'Ryzen 9 7940HS'],
  amd8H: ['Ryzen 7 8845HS', 'Ryzen 9 8945HS'],
  amd4And5H: ['Ryzen 5 4600H', 'Ryzen 7 4800H', 'Ryzen 5 5600H', 'Ryzen 7 5800H'],
  amdDesktopGe: ['Ryzen 5 PRO 4650GE', 'Ryzen 7 PRO 4750GE'],

  surface10: ['i5-1035G4', 'i7-1065G7'],
  surface11AndAmd: ['i5-1135G7', 'i7-1185G7', 'Ryzen 5 4680U', 'Ryzen 7 4980U'],
  surfaceSnapdragonX: ['Snapdragon X Plus', 'Snapdragon X Elite'],
  surfacePro9: ['i5-1235U', 'i7-1255U', 'Microsoft SQ3'],
  surfaceProX: ['Microsoft SQ1', 'Microsoft SQ2'],
  surfaceGo2: ['Pentium Gold 4425Y', 'Core m3-8100Y'],
  surfaceGo3: ['Pentium Gold 6500Y', 'i3-10100Y'],

  chromebookIntel: [
    'Celeron N3350',
    'Celeron N4000',
    'Celeron N4020',
    'Celeron N4500',
    'Celeron N5100',
    'Pentium Silver N5000'
  ],
  chromebookArm: ['MT8183', 'Kompanio 520', 'Snapdragon 7c Gen 2']
});

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function group(...names) {
  return unique(names.flatMap((name) => GROUPS[name] || [name]));
}

function resolveDell(modelName) {
  if (/^OptiPlex\s+/i.test(modelName)) {
    if (/\b7070 Ultra\b/i.test(modelName)) return ['i5-8365U', 'i7-8665U'];
    if (/\b7090 Ultra\b/i.test(modelName)) return group('intel11U');

    const number = modelName.match(/^OptiPlex\s+(\d{4})\b/i)?.[1];
    const compact = /\b(Micro|MFF)\b/i.test(modelName);
    const generationGroups = {
      3040: ['intel6Desktop', 'intel6DesktopT'],
      5040: ['intel6Desktop', 'intel6DesktopT'],
      7040: ['intel6Desktop', 'intel6DesktopT'],
      3050: ['intel7Desktop', 'intel7DesktopT'],
      5050: ['intel7Desktop', 'intel7DesktopT'],
      7050: ['intel7Desktop', 'intel7DesktopT'],
      3060: ['intel8Desktop', 'intel8DesktopT'],
      5060: ['intel8Desktop', 'intel8DesktopT'],
      7060: ['intel8Desktop', 'intel8DesktopT'],
      3070: ['intel9Desktop', 'intel9DesktopT'],
      5070: ['intel9Desktop', 'intel9DesktopT'],
      7070: ['intel9Desktop', 'intel9DesktopT'],
      3080: ['intel10Desktop', 'intel10DesktopT'],
      5080: ['intel10Desktop', 'intel10DesktopT'],
      7080: ['intel10Desktop', 'intel10DesktopT'],
      3090: ['intel10Desktop', 'intel10DesktopT'],
      5090: [['intel10Desktop', 'intel11Desktop'], ['intel10DesktopT', 'intel11DesktopT']],
      7090: [['intel10Desktop', 'intel11Desktop'], ['intel10DesktopT', 'intel11DesktopT']],
      3000: ['intel12Desktop', 'intel12DesktopT'],
      5000: ['intel12Desktop', 'intel12DesktopT'],
      7000: ['intel12Desktop', 'intel12DesktopT'],
      7010: [['intel12Desktop', 'intel13Desktop'], ['intel12DesktopT', 'intel13DesktopT']],
      7020: ['intel14Desktop', 'intel14DesktopT']
    };

    const names = number ? generationGroups[number] : null;
    if (names) {
      const selectedGroups = compact ? names[1] : names[0];
      return group(...(Array.isArray(selectedGroups) ? selectedGroups : [selectedGroups]));
    }
  }

  if (/^Latitude\s+/i.test(modelName)) {
    if (/\b(5401|5501)\b/i.test(modelName)) return group('intel9H');
    if (/\b(5411|5511)\b/i.test(modelName)) return group('intel10H');
    if (/\b(5421|5521)\b/i.test(modelName)) return group('intel11H');
    if (/\b(5431|5531)\b/i.test(modelName)) return group('intel12H');
    if (/\b7220\b.*\bRugged\b/i.test(modelName)) return group('intel8RefreshU');

    const number = modelName.match(/^Latitude\s+(\d{4})\b/i)?.[1];
    const buckets = [
      [new Set(['5300', '5400', '5500', '7200', '7300', '7400']), 'intel8RefreshU'],
      [new Set(['5310', '5410', '5510', '7210', '7310', '7410']), 'intel10U'],
      [new Set(['5320', '5420', '5520', '7320', '7420', '7520']), 'intel11U'],
      [new Set(['5330', '5430', '5530', '7330', '7430', '7530']), 'intel12U'],
      [new Set(['5340', '5440', '5540', '7340', '7440', '7640']), 'intel13U'],
      [new Set(['5350', '5450', '5550', '7350', '7450', '7650']), 'intelUltraU']
    ];
    const match = buckets.find(([models]) => models.has(number));
    if (match) return group(match[1]);
  }

  if (/^Precision\s+/i.test(modelName)) {
    const number = modelName.match(/^Precision\s+(\d{4})\b/i)?.[1];
    if (!number) return [];
    if (number === '3590') return group('intelUltraU');
    if (number === '5690') return group('intelUltraH');
    if (['3580', '5680', '7680', '7780'].includes(number)) return group('intel13H');

    const suffixGroups = {
      10: 'intel6H',
      20: 'intel7H',
      30: 'intel8H',
      40: 'intel9H',
      50: 'intel10H',
      60: 'intel11H',
      70: 'intel12H'
    };
    const suffix = number.slice(-2);
    if (suffixGroups[suffix]) return group(suffixGroups[suffix]);
  }

  return [];
}

function resolveLenovo(modelName) {
  if (/^ThinkCentre\s+/i.test(modelName)) {
    const compact = /\b(Tiny|Micro|MFF)\b/i.test(modelName);
    if (/\bM73\b/i.test(modelName)) return group(compact ? 'intel4DesktopT' : 'intel4Desktop');
    if (/\bM(?:700|900)\b/i.test(modelName)) return group(compact ? 'intel6DesktopT' : 'intel6Desktop');
    if (/\bM(?:710|910)[a-z]?\b/i.test(modelName)) return group(compact ? 'intel7DesktopT' : 'intel7Desktop');
    if (/\bM(?:720|920)[a-z]?\b/i.test(modelName)) return group(compact ? 'intel8DesktopT' : 'intel8Desktop');
    if (/\bM75[a-z]?\b/i.test(modelName)) return group('amdDesktopGe');
    if (/\bM(?:70|80|90)[a-z]?\b/i.test(modelName)) return group(compact ? 'intel10DesktopT' : 'intel10Desktop');
  }

  if (!/^ThinkPad\s+/i.test(modelName)) return [];

  const workstationRules = [
    [/^ThinkPad P50\b/i, 'intel6H'],
    [/^ThinkPad P51\b/i, 'intel7H'],
    [/^ThinkPad P52\b/i, 'intel8H'],
    [/^ThinkPad P53\b/i, 'intel9H'],
    [/^ThinkPad P15 Gen 1\b/i, 'intel10H'],
    [/^ThinkPad P15 Gen 2\b/i, 'intel11H'],
    [/^ThinkPad P16 Gen 1\b/i, 'intel12H'],
    [/^ThinkPad P16 Gen 2\b/i, 'intel13H'],
    [/^ThinkPad P1 Gen 1\b/i, 'intel8H'],
    [/^ThinkPad P1 Gen 2\b/i, 'intel9H'],
    [/^ThinkPad P1 Gen 3\b/i, 'intel10H'],
    [/^ThinkPad P1 Gen 4\b/i, 'intel11H'],
    [/^ThinkPad P1 Gen 5\b/i, 'intel12H'],
    [/^ThinkPad P1 Gen 6\b/i, 'intel13H'],
    [/^ThinkPad P1 Gen 7\b/i, 'intelUltraH'],
    [/^ThinkPad T15p Gen 1\b/i, 'intel10H'],
    [/^ThinkPad T15p Gen 2\b/i, 'intel11H']
  ];
  const workstationMatch = workstationRules.find(([pattern]) => pattern.test(modelName));
  if (workstationMatch) return group(workstationMatch[1]);

  if (/\b(T460s?|X260|L460|E460)\b/i.test(modelName)) return group('intel6U');
  if (/\b(T470s?|X270|L470|E470)\b/i.test(modelName)) return group('intel7U');
  if (/\b(T480s?|X280|L480|E480)\b/i.test(modelName)) return group('intel8U');
  if (/\b(T490s?|X390|L490|E490)\b/i.test(modelName)) return group('intel8RefreshU');
  if (/\b(T495s?|X395)\b/i.test(modelName)) return group('amd3ProU');

  const carbonGeneration = Number(modelName.match(/\bX1 Carbon Gen (\d+)\b/i)?.[1] || 0);
  if (carbonGeneration) {
    const map = {
      4: 'intel6U',
      5: 'intel7U',
      6: 'intel8U',
      7: 'intel8RefreshU',
      8: 'intel10U',
      9: 'intel11U',
      10: 'intel12U',
      11: 'intel13U',
      12: 'intelUltraU',
      13: 'intelUltra2U'
    };
    return group(map[carbonGeneration]);
  }

  const yogaGeneration = Number(modelName.match(/\bX1 Yoga Gen (\d+)\b/i)?.[1] || 0);
  if (yogaGeneration) {
    const map = {
      1: 'intel6U',
      2: 'intel7U',
      3: 'intel8U',
      4: 'intel8RefreshU',
      5: 'intel10U',
      6: 'intel11U',
      7: 'intel12U',
      8: 'intel13U',
      9: 'intelUltraU'
    };
    return group(map[yogaGeneration]);
  }

  const generation = Number(modelName.match(/\bGen (\d+)\b/i)?.[1] || 0);
  if (generation) {
    const map = {
      1: 'intel10U',
      2: 'intel11U',
      3: 'intel12U',
      4: 'intel13U',
      5: 'intelUltraU',
      6: 'intelUltra2U'
    };
    return group(map[generation]);
  }

  return [];
}

function resolveMicrosoft(modelName) {
  const mappings = new Map([
    ['Surface Laptop 3', group('surface10')],
    ['Surface Laptop 4', group('surface11AndAmd')],
    ['Surface Laptop 5', group('intel12U')],
    ['Surface Laptop 6 for Business', group('intelUltraH')],
    ['Surface Laptop 7', group('surfaceSnapdragonX')],
    ['Surface Laptop Go', ['i5-1035G1']],
    ['Surface Laptop Go 2', ['i5-1135G7']],
    ['Surface Laptop Go 3', ['i5-1235U']],
    ['Surface Book 2', group('intel8U')],
    ['Surface Book 3', group('surface10')],
    ['Surface Pro 6', group('intel8U')],
    ['Surface Pro 7', group('surface10')],
    ['Surface Pro 7+', group('intel11U')],
    ['Surface Pro 8', group('intel11U')],
    ['Surface Pro 9', group('surfacePro9')],
    ['Surface Pro 10 for Business', group('intelUltraU')],
    ['Surface Pro 11', group('surfaceSnapdragonX')],
    ['Surface Pro X', group('surfaceProX')],
    ['Surface Go 2', group('surfaceGo2')],
    ['Surface Go 3', group('surfaceGo3')],
    ['Surface Go 4', ['Intel Processor N200']]
  ]);
  return mappings.get(modelName) || [];
}

function resolveHp(modelName) {
  if (/^ProBook\s+(640|650) G2\b/i.test(modelName)) return group('intel6U');
  if (/^ProBook\s+645 G2\b/i.test(modelName)) return ['AMD PRO A10-8700B'];
  if (/^(EliteDesk 800|ProDesk 400) G2\b/i.test(modelName)) {
    return group(/\bMini\b/i.test(modelName) ? 'intel6DesktopT' : 'intel6Desktop');
  }
  return [];
}

function resolveAsus(modelName) {
  if (/\bGA401\b/i.test(modelName)) return group('amd4H');
  if (/\bGA402\b/i.test(modelName)) return group('amd6And7H');
  if (/\bGA403\b/i.test(modelName)) return group('amd8H');
  if (/\bGA503\b/i.test(modelName)) return group('amd5H');
  if (/\bFA506\b/i.test(modelName)) return group('amd4And5H');
  if (/\bFA507\b/i.test(modelName)) return group('amd6And7H');
  if (/\bFX506\b/i.test(modelName)) return group('i5-10300H', 'i7-10750H', 'intel11H');
  if (/\bFX507\b/i.test(modelName)) return group('intel12H', 'intel13H');
  return [];
}

function resolveAcer(modelName) {
  const mappings = new Map([
    ['Spin 3 SP314-51', group('intel8U')],
    ['Spin 3 SP314-54N', group('intel10U')],
    ['Spin 5 SP513-54N', group('intel10U')],
    ['Spin 5 SP513-55N', group('intel11U')],
    ['Extensa 15 EX215-22', group('amd3U')],
    ['Extensa 15 EX215-54', group('intel12U')]
  ]);
  return mappings.get(modelName) || [];
}

function resolveChromebookFallback(manufacturerName) {
  const manufacturer = normalizeText(manufacturerName).toLowerCase();
  if (manufacturer === 'dell') {
    return group('chromebookIntel', 'i5-8250U', 'i5-10210U');
  }
  if (manufacturer === 'hp') {
    return group('chromebookIntel', 'chromebookArm', 'i3-8130U');
  }
  if (manufacturer === 'acer' || manufacturer === 'asus' || manufacturer === 'lenovo') {
    return group('chromebookIntel', 'chromebookArm');
  }
  return group('chromebookIntel', 'chromebookArm');
}

function getCuratedProcessorCodes({ manufacturerName, categoryCode, modelName }) {
  const manufacturer = normalizeText(manufacturerName);
  const category = normalizeText(categoryCode).toLowerCase();
  const model = normalizeText(modelName);

  let result = [];
  if (/^dell$/i.test(manufacturer)) result = resolveDell(model);
  else if (/^lenovo$/i.test(manufacturer)) result = resolveLenovo(model);
  else if (/^microsoft$/i.test(manufacturer)) result = resolveMicrosoft(model);
  else if (/^hp$/i.test(manufacturer)) result = resolveHp(model);
  else if (/^asus$/i.test(manufacturer)) result = resolveAsus(model);
  else if (/^acer$/i.test(manufacturer)) result = resolveAcer(model);

  if (result.length === 0 && category === 'chrome') {
    result = resolveChromebookFallback(manufacturer);
  }

  return unique(result);
}

function inferProcessorDefinition(modelCode) {
  const code = normalizeText(modelCode);
  const metadata = getProcessorMetadata(code);
  if (metadata) {
    return {
      brandName: metadata.brandName,
      modelCode: code,
      processorFamily: metadata.processorFamily,
      generation: metadata.generation,
      baseSpeedGhz: metadata.baseSpeedGhz
    };
  }

  let brandName = 'Intel';
  let processorFamily = 'Core';

  if (/^(Ryzen|AMD\b)/i.test(code)) {
    brandName = 'AMD';
    processorFamily = /^Ryzen/i.test(code) ? 'Ryzen' : 'AMD PRO';
  } else if (/^(Snapdragon|Microsoft SQ)/i.test(code)) {
    brandName = 'Qualcomm';
    processorFamily = /^Microsoft SQ/i.test(code) ? 'Microsoft SQ' : 'Snapdragon';
  } else if (/^(MT\d|Kompanio)/i.test(code)) {
    brandName = 'MediaTek';
    processorFamily = 'Kompanio / MediaTek';
  } else if (/^RK\d/i.test(code)) {
    brandName = 'Rockchip';
    processorFamily = 'Rockchip';
  } else if (/^Xeon\b/i.test(code)) {
    processorFamily = 'Xeon';
  } else if (/^Pentium Gold\b/i.test(code)) {
    processorFamily = 'Pentium Gold';
  } else if (/^Pentium\b/i.test(code)) {
    processorFamily = 'Pentium';
  } else if (/^Celeron\b/i.test(code)) {
    processorFamily = 'Celeron';
  } else if (/^Intel Processor\b/i.test(code)) {
    processorFamily = 'Intel Processor';
  } else if (/^Core Ultra\b/i.test(code)) {
    processorFamily = 'Core Ultra';
  }

  return {
    brandName,
    modelCode: code,
    processorFamily,
    generation: null,
    baseSpeedGhz: null
  };
}

module.exports = {
  GROUPS,
  getCuratedProcessorCodes,
  inferProcessorDefinition,
  normalizeText
};
