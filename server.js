require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const dashboardRoutes = require('./routes/dashboard');
const systemRoutes = require('./routes/system');
const managementRoutes = require('./routes/management');
const configRoutes = require('./routes/config');
const lotRoutes = require('./routes/lots');
const { createSessionStore } = require('./models/sessionStore');
const unitRequestModel = require('./models/unitRequestModel');
const {
  scheduleOperationalOptionUsageRankingRefresh
} = require('./models/operationalOptionRankingModel');
const { loadCurrentUser } = require('./middleware/authMiddleware');
const { applyConfiguredSessionTimeout } = require('./middleware/sessionTimeoutMiddleware');
const { DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES } = require('./services/sessionInactivityTimeoutPolicy');
const { applyAuthenticatedNavigationPolicy } = require('./middleware/navigationPolicyMiddleware');
const { attachAccessLocals } = require('./middleware/accessMiddleware');
const { escapeHtml, formatDateTime, formatDate, formatTime, formatNumber, formatBytes, formatRoleLabel, formatWeight } = require('./views/partials/helpers');

const app = express();
const PORT = process.env.PORT || 3000;
const UNIT_REQUEST_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production.');
}

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.escapeHtml = escapeHtml;
app.locals.formatDateTime = formatDateTime;
app.locals.formatDate = formatDate;
app.locals.formatTime = formatTime;
app.locals.formatNumber = formatNumber;
app.locals.formatBytes = formatBytes;
app.locals.formatRoleLabel = formatRoleLabel;
app.locals.formatWeight = formatWeight;
app.locals.appName = 'BWTDallas App';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    name: 'bwtdallas.sid',
    secret: process.env.SESSION_SECRET || 'development-only-change-me',
    store: createSessionStore(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * DEFAULT_SESSION_INACTIVITY_TIMEOUT_MINUTES
    }
  })
);

app.use(applyConfiguredSessionTimeout);
app.use(loadCurrentUser);
app.use(applyAuthenticatedNavigationPolicy);
app.use(attachAccessLocals);

app.use('/api/v1', apiRoutes);
app.use(authRoutes);
app.use(dashboardRoutes);
app.use(systemRoutes);
app.use(managementRoutes);
app.use(configRoutes);
app.use(lotRoutes);

function scheduleUnitRequestRetention() {
  const runRetentionPass = async () => {
    try {
      const result = await unitRequestModel.archiveResolvedUnitRequests();

      if (!result.supported) {
        console.warn('Unit Request retention pass skipped because the Step 7h archive schema is not available yet.');
        return;
      }

      if (result.archivedCount > 0) {
        console.log(`Unit Request retention pass archived ${result.archivedCount} resolved request(s).`);
      }
    } catch (error) {
      console.error('Unit Request retention pass failed:', error);
    }
  };

  void runRetentionPass();
  const retentionTimer = setInterval(() => {
    void runRetentionPass();
  }, UNIT_REQUEST_RETENTION_INTERVAL_MS);

  retentionTimer.unref();
}

app.use((req, res) => {
  res.status(404).render('pages/not-found', {
    pageTitle: 'Page Not Found',
    requestedPath: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled application error:', err);

  if (req.originalUrl.startsWith('/api/v1/')) {
    if (err?.code === 'API_TOOL_CREDENTIAL_CONFIGURATION') {
      return res.status(503).json({
        error: {
          code: 'API_NOT_CONFIGURED',
          message: 'The API tool credentials are not configured correctly.'
        }
      });
    }

    if (err instanceof SyntaxError && err.status === 400 && Object.hasOwn(err, 'body')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_JSON',
          message: 'The request body contains invalid JSON.'
        }
      });
    }

    return res.status(500).json({
      error: {
        code: 'API_INTERNAL_ERROR',
        message: 'Something went wrong while processing the API request.'
      }
    });
  }

  res.status(500).render('pages/error', {
    pageTitle: 'Application Error',
    message: 'Something went wrong while processing your request.',
    error: process.env.NODE_ENV === 'production' ? null : err
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  scheduleUnitRequestRetention();
  scheduleOperationalOptionUsageRankingRefresh();
});