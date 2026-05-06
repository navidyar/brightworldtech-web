const express = require('express');
const router = express.Router();
const pageController = require('../controllers/pageController');
const itemController = require('../controllers/itemController');

router.get('/', pageController.renderHomePage);

router.get('/items', itemController.renderItemsPage);
router.get('/items/form', itemController.renderItemFormFragment);
router.get('/items/table', itemController.listItemsFragment);
router.get('/items/:id', itemController.renderItemDetailsPage);

router.post('/items/form', itemController.submitItemForm);
router.delete('/items/:id', itemController.deleteItemHtmx);

router.get('/api/items', itemController.listItems);
router.post('/api/items', itemController.createItem);
router.put('/api/items/:id', itemController.updateItem);
router.delete('/api/items/:id', itemController.deleteItem);

router.use(pageController.renderNotFoundPage);

module.exports = router;