'use strict';

function normalizeText(value) {
  return String(value || '')
    .trim()
    .replace(/[™®]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeBrand(value) {
  return normalizeText(value).toLowerCase();
}

function getIntelCoreGeneration(modelNumber) {
  const digits = String(modelNumber || '').replace(/\D/g, '');

  if (digits.length >= 4) {
    const twoDigitGeneration = Number(digits.slice(0, 2));
    if (twoDigitGeneration >= 10 && twoDigitGeneration <= 14) {
      return twoDigitGeneration;
    }

    const oneDigitGeneration = Number(digits.slice(0, 1));
    return oneDigitGeneration >= 4 && oneDigitGeneration <= 9 ? oneDigitGeneration : null;
  }

  return null;
}

function ordinal(value) {
  const number = Number(value);
  const remainder100 = number % 100;
  const remainder10 = number % 10;

  if (remainder100 >= 11 && remainder100 <= 13) return `${number}th`;
  if (remainder10 === 1) return `${number}st`;
  if (remainder10 === 2) return `${number}nd`;
  if (remainder10 === 3) return `${number}rd`;
  return `${number}th`;
}

function classifyIntel(modelCode) {
  const normalized = normalizeText(modelCode);
  const upper = normalized.toUpperCase();
  const families = [];
  const ultraMatch = upper.match(/\bCORE\s+ULTRA\s+([3579])\s+([12])\d{2}[A-Z0-9-]*\b/);

  if (ultraMatch) {
    families.push(`intel-core-ultra-${ultraMatch[1]}-series-${ultraMatch[2]}`);
    return families;
  }

  const coreMatch = upper.match(/\bI([3579])[-\s]?((?:10\d{2,3}|(?:11|12|13|14)\d{2,3}|[4-9]\d{3}))[A-Z0-9-]*\b/);

  if (coreMatch) {
    const generation = getIntelCoreGeneration(coreMatch[2]);
    if (generation) {
      families.push(`intel-i${coreMatch[1]}-${ordinal(generation)}-gen`);
    }
    return families;
  }

  const coreMMatch = upper.match(/\bCORE\s+M([357])[-\s]?((?:6|7|8|9)\w+|(?:10|11|12|13|14)\w+)\b/);
  if (coreMMatch) {
    const generation = getIntelCoreGeneration(coreMMatch[2]);
    if (generation) {
      families.push(`intel-core-m${coreMMatch[1]}-${ordinal(generation)}-gen`);
    }
    return families;
  }

  const xeonGenerationRules = [
    [/\bXEON\s+E3-\d+M\s+V5\b/, 6],
    [/\bXEON\s+E3-\d+M\s+V6\b/, 7],
    [/\bXEON\s+E-22\d{2}M\b/, 9],
    [/\bXEON\s+E-21\d{2}M\b/, 8],
    [/\bXEON\s+W-10\d{3}M\b/, 10],
    [/\bXEON\s+W-11\d{3}M\b/, 11]
  ];
  const xeonMatch = xeonGenerationRules.find(([pattern]) => pattern.test(upper));
  if (xeonMatch) {
    families.push(`intel-xeon-mobile-${ordinal(xeonMatch[1])}-gen`);
    return families;
  }

  if (/\bINTEL\s+PROCESSOR\s+N\d+\b/.test(upper)) {
    families.push('intel-processor-n-series');
    return families;
  }

  if (/\bCELERON\b/.test(upper)) {
    families.push('intel-celeron');
    return families;
  }

  if (/\bPENTIUM\s+GOLD\b/.test(upper)) {
    families.push('intel-pentium-gold');
    return families;
  }

  if (/\bPENTIUM\s+SILVER\b/.test(upper)) {
    families.push('intel-pentium-silver');
  }

  return families;
}

function classifyAmd(modelCode) {
  const upper = normalizeText(modelCode).toUpperCase();

  if (/\b(?:AMD\s+)?PRO\s+A10-8700B\b/.test(upper)) {
    return ['amd-pro-a10-6th-gen'];
  }

  const match = upper.match(/\bRYZEN\s+([3579])(?:\s+PRO)?\s+([2-9])\d{3}[A-Z0-9-]*\b/);

  if (!match) return [];

  return [`amd-ryzen-${match[1]}-${match[2]}000-series`];
}

function classifyApple(modelCode) {
  const upper = normalizeText(modelCode).toUpperCase();
  const match = upper.match(/\b(?:APPLE\s+)?M([1-9])(?:\s|$)/);

  return match ? [`apple-m${match[1]}-family`] : [];
}

function classifyQualcomm(modelCode) {
  const upper = normalizeText(modelCode).toUpperCase();

  if (/\bMICROSOFT\s+SQ[123]\b/.test(upper)) return ['qualcomm-microsoft-sq'];
  if (/\bSNAPDRAGON\s+X\b/.test(upper)) return ['qualcomm-snapdragon-x'];
  if (/\bSNAPDRAGON\s+8CX\b/.test(upper)) return ['qualcomm-snapdragon-8cx'];
  if (/\bSNAPDRAGON\s+7C\b/.test(upper)) return ['qualcomm-snapdragon-7c'];
  return [];
}

function classifyMediaTek(modelCode) {
  const upper = normalizeText(modelCode).toUpperCase();

  if (/\bKOMPANIO\b/.test(upper)) return ['mediatek-kompanio'];
  if (/\bMT81\d{2}[A-Z]?\b/.test(upper)) return ['mediatek-mt81xx'];
  return [];
}

function classifyRockchip(modelCode) {
  const upper = normalizeText(modelCode).toUpperCase();

  if (/\bRK32\d{2}[A-Z]?\b/.test(upper)) return ['rockchip-rk32xx'];
  if (/\bRK33\d{2}[A-Z]?\b/.test(upper)) return ['rockchip-rk33xx'];
  return [];
}

function classifyProcessorFamilyCodes({ brandName = '', modelCode = '' } = {}) {
  const brand = normalizeBrand(brandName);

  if (brand.includes('intel')) return classifyIntel(modelCode);
  if (brand === 'amd' || brand.includes('advanced micro devices')) return classifyAmd(modelCode);
  if (brand.includes('apple')) return classifyApple(modelCode);
  if (brand.includes('qualcomm')) return classifyQualcomm(modelCode);
  if (brand.includes('mediatek')) return classifyMediaTek(modelCode);
  if (brand.includes('rockchip')) return classifyRockchip(modelCode);
  return [];
}

module.exports = {
  classifyProcessorFamilyCodes,
  getIntelCoreGeneration,
  normalizeBrand,
  normalizeText,
  ordinal
};
