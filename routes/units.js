const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const unitController = require('../controllers/unitController');

router.get('/', pageController.renderHomePage);

router.get('/units', unitController.renderUnitsPage);
router.get('/units/form', unitController.renderUnitFormFragment);
router.get('/units/table', unitController.listUnitsFragment);
router.get('/units/:id', unitController.renderUnitDetailsPage);

router.post('/units/form', unitController.submitUnitForm);
router.delete('/units/:id', unitController.deleteUnitHtmx);

router.get('/api/units', unitController.listUnits);
router.post('/api/units', unitController.createUnit);
router.put('/api/units/:id', unitController.updateUnit);
router.delete('/api/units/:id', unitController.deleteUnit);

router.use(pageController.renderNotFoundPage);

module.exports = router;