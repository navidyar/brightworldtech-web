const GLOBAL_CONTEXT_SCOPE = 'global';
const GLOBAL_CONTEXT_KEY = '0';

function normalizeKey(value) {
  const normalized = String(value ?? '').trim();

  return normalized || '';
}

function normalizeScore(value) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rankingKey(optionScope, optionKey, contextScope = GLOBAL_CONTEXT_SCOPE, contextKey = GLOBAL_CONTEXT_KEY) {
  return [
    normalizeKey(optionScope),
    normalizeKey(optionKey),
    normalizeKey(contextScope) || GLOBAL_CONTEXT_SCOPE,
    normalizeKey(contextKey) || GLOBAL_CONTEXT_KEY
  ].join('::');
}

function createRankingSnapshot(rows = []) {
  const rankings = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const optionScope = normalizeKey(row.option_scope ?? row.optionScope);
    const optionKey = normalizeKey(row.option_key ?? row.optionKey);
    const contextScope = normalizeKey(row.context_scope ?? row.contextScope) || GLOBAL_CONTEXT_SCOPE;
    const contextKey = normalizeKey(row.context_key ?? row.contextKey) || GLOBAL_CONTEXT_KEY;

    if (!optionScope || !optionKey) {
      return;
    }

    rankings.set(rankingKey(optionScope, optionKey, contextScope, contextKey), {
      optionScope,
      optionKey,
      contextScope,
      contextKey,
      lifetimeCount: normalizeScore(row.lifetime_count ?? row.lifetimeCount),
      count90d: normalizeScore(row.count_90d ?? row.count90d),
      count30d: normalizeScore(row.count_30d ?? row.count30d),
      weightedScore: normalizeScore(row.weighted_score ?? row.weightedScore),
      lastSelectedAt: row.last_selected_at ?? row.lastSelectedAt ?? null
    });
  });

  function get(optionScope, optionKey, contextScope = GLOBAL_CONTEXT_SCOPE, contextKey = GLOBAL_CONTEXT_KEY) {
    return rankings.get(rankingKey(optionScope, optionKey, contextScope, contextKey)) || null;
  }

  function score(optionScope, optionKey, contextScope = GLOBAL_CONTEXT_SCOPE, contextKey = GLOBAL_CONTEXT_KEY) {
    const contextual = get(optionScope, optionKey, contextScope, contextKey);

    if (contextual) {
      return contextual.weightedScore;
    }

    if (contextScope !== GLOBAL_CONTEXT_SCOPE || String(contextKey) !== GLOBAL_CONTEXT_KEY) {
      const global = get(optionScope, optionKey);

      return global ? global.weightedScore : 0;
    }

    return 0;
  }

  return {
    size: rankings.size,
    get,
    score,
    rows: Array.from(rankings.values())
  };
}

function getOptionLabel(option) {
  return String(option?.label ?? option?.shortLabel ?? option?.code ?? option?.value ?? option?.id ?? '');
}

function compareLabels(left, right) {
  return getOptionLabel(left).localeCompare(getOptionLabel(right), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function sortOptionsByPopularity(options, snapshot, {
  optionScope,
  getOptionKey = (option) => option?.id,
  getContextScope = () => GLOBAL_CONTEXT_SCOPE,
  getContextKey = () => GLOBAL_CONTEXT_KEY,
  getGroupKey = () => '',
  getIsActive = (option) => option?.isActive !== false
} = {}) {
  const safeOptions = Array.isArray(options) ? options.slice() : [];

  if (!snapshot || typeof snapshot.score !== 'function' || !optionScope || snapshot.size === 0) {
    return safeOptions;
  }

  return safeOptions.sort((left, right) => {
    const leftActive = getIsActive(left) ? 1 : 0;
    const rightActive = getIsActive(right) ? 1 : 0;

    if (leftActive !== rightActive) {
      return rightActive - leftActive;
    }

    const leftGroup = normalizeKey(getGroupKey(left));
    const rightGroup = normalizeKey(getGroupKey(right));

    if (leftGroup !== rightGroup) {
      return leftGroup.localeCompare(rightGroup, undefined, {
        numeric: true,
        sensitivity: 'base'
      });
    }

    const leftScore = snapshot.score(
      optionScope,
      getOptionKey(left),
      getContextScope(left),
      getContextKey(left)
    );
    const rightScore = snapshot.score(
      optionScope,
      getOptionKey(right),
      getContextScope(right),
      getContextKey(right)
    );

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return compareLabels(left, right);
  });
}

function attachContextScores(options, snapshot, {
  optionScope,
  getOptionKey = (option) => option?.id,
  contextScope,
  getContextKeys = () => []
} = {}) {
  const safeOptions = Array.isArray(options) ? options : [];

  return safeOptions.map((option) => {
    const usageScoresByContext = {};

    (Array.isArray(getContextKeys(option)) ? getContextKeys(option) : []).forEach((contextKey) => {
      const normalizedContextKey = normalizeKey(contextKey);

      if (!normalizedContextKey) {
        return;
      }

      const contextualRanking = snapshot && typeof snapshot.get === 'function'
        ? snapshot.get(optionScope, getOptionKey(option), contextScope, normalizedContextKey)
        : null;

      usageScoresByContext[normalizedContextKey] = contextualRanking
        ? contextualRanking.weightedScore
        : 0;
    });

    return {
      ...option,
      usageScore: snapshot?.score(optionScope, getOptionKey(option)) || 0,
      usageScoresByContext
    };
  });
}

function serializeUsageScoresByContext(scores = {}) {
  return Object.entries(scores)
    .filter(([contextKey]) => normalizeKey(contextKey))
    .sort(([left], [right]) => String(left).localeCompare(String(right), undefined, { numeric: true }))
    .map(([contextKey, score]) => `${contextKey}:${normalizeScore(score)}`)
    .join(',');
}

module.exports = {
  GLOBAL_CONTEXT_KEY,
  GLOBAL_CONTEXT_SCOPE,
  attachContextScores,
  createRankingSnapshot,
  rankingKey,
  serializeUsageScoresByContext,
  sortOptionsByPopularity
};
