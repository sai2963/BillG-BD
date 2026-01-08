const express = require("express");
const { generateHmsToken } = require("../controllers/hmsController");

const router = express.Router();

router.post("/token", generateHmsToken);

module.exports = router;
