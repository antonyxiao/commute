const express = require('express');
const router = express.Router();
const stopController = require('../controllers/stopController');
const tripController = require('../controllers/tripController');
const vehicleController = require('../controllers/vehicleController');

// Stop routes
router.get('/stops', stopController.getStops);
router.get('/stops_in_bounds', stopController.getStopsInBounds);

// Trip/StopTimes routes
router.get('/stop_times/:stop_id', tripController.getStopTimes);

// Vehicle routes
router.get('/vehicles_for_stop/:stop_id', vehicleController.getVehiclesForStop);

module.exports = router;
