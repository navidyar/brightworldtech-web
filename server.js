require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const systemRoutes = require('./routes/system');
const managementRoutes = require('./routes/management');
const configRoutes = require('./routes/config');
const lotRoutes = require('./routes/lots');
const { createSessionStore } = require('./models/sessionStore');
const { loadCurrentUser } = require('./middleware/authMiddleware');
const { attachAccessLocals } = require('./middleware/accessMiddleware');
const { escapeHtml, formatDateTime, formatNumber, formatWeight } = require('./views/partials/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET is required in production.');
}

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.escapeHtml = escapeHtml;
app.locals.formatDateTime = formatDateTime;
app.locals.formatNumber = formatNumber;
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
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use(loadCurrentUser);
app.use(attachAccessLocals);

app.use(authRoutes);
app.use(dashboardRoutes);
app.use(systemRoutes);
app.use(managementRoutes);
app.use(configRoutes);
app.use(lotRoutes);

app.use((req, res) => {
  res.status(404).render('pages/not-found', {
    pageTitle: 'Page Not Found',
    requestedPath: req.originalUrl
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled application error:', err);

  res.status(500).render('pages/error', {
    pageTitle: 'Application Error',
    message: 'Something went wrong while processing your request.',
    error: process.env.NODE_ENV === 'production' ? null : err
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});