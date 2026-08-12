const STANDARD_CONFIG_VALUE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,118}[a-z0-9]$/;
const SHORT_CONFIG_VALUE_CODE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,118}[a-z0-9])?$/;

function isValidConfigValueCode(code, options = {}) {
  const pattern = options.allowShort === true
    ? SHORT_CONFIG_VALUE_CODE_PATTERN
    : STANDARD_CONFIG_VALUE_CODE_PATTERN;

  return pattern.test(String(code || ''));
}

module.exports = {
  STANDARD_CONFIG_VALUE_CODE_PATTERN,
  SHORT_CONFIG_VALUE_CODE_PATTERN,
  isValidConfigValueCode
};
