(function () {
  const COOKIE_NAME = 'bwtdallas.timezone';
  const RELOAD_KEY = 'bwtdallas-timezone-reload';
  const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

  function readCookie(name) {
    const prefix = `${name}=`;
    const match = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));

    if (!match) return '';

    try {
      return decodeURIComponent(match.slice(prefix.length));
    } catch (error) {
      return '';
    }
  }

  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone || typeof timeZone !== 'string') return;

    try {
      new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    } catch (error) {
      return;
    }

    const current = readCookie(COOKIE_NAME);
    if (current === timeZone) {
      sessionStorage.removeItem(RELOAD_KEY);
      return;
    }

    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(timeZone)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax`;

    if (sessionStorage.getItem(RELOAD_KEY) !== timeZone) {
      sessionStorage.setItem(RELOAD_KEY, timeZone);
      window.location.reload();
    }
  } catch (error) {
    // Timezone detection is an enhancement. Server-side fallback remains authoritative.
  }
})();
