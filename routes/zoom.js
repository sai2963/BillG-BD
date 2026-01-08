const express = require("express");
const { createZoomMeeting } = require("../controllers/zoomController");

const router = express.Router();

router.post("/create-meeting", createZoomMeeting);

module.exports = router;
