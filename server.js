require('dotenv').config();

const path = require('path');
const express = require('express');

const systemRoutes = require('./routes/system');
const { escapeHtml, formatDateTime, formatNumber } = require('./views/partials/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.escapeHtml = escapeHtml;
app.locals.formatDateTime = formatDateTime;
app.locals.formatNumber = formatNumber;
app.locals.appName = 'BWTDallas App';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(systemRoutes);

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