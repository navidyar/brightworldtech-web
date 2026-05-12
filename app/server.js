require('dotenv').config();

const path = require('path');
const express = require('express');
const unitsRoute = require('./routes/units');
const { escapeHtml, formatPrice } = require('./views/partials/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.locals.escapeHtml = escapeHtml;
app.locals.formatPrice = formatPrice;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    app: 'ok',
    message: 'Server is running'
  });
});

app.use(unitsRoute);

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});