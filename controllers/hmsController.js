const jwt = require("jsonwebtoken");

const generateHmsToken = (req, res) => {
  try {
    const { roomId, role } = req.body;

    if (!roomId || !role) {
      return res.status(400).json({
        message: "roomId and role are required"
      });
    }

    const payload = {
      access_key: process.env.HMS_ACCESS_KEY,
      room_id: roomId,
      user_id: `user-${Date.now()}`,
      role: role,
      type: "app",
      version: 2
    };

    const token = jwt.sign(payload, process.env.HMS_SECRET, {
      algorithm: "HS256",
      expiresIn: "24h"
    });

    res.status(200).json({ token });
  } catch (error) {
    console.error("100ms Token Error:", error);
    res.status(500).json({
      message: "Failed to generate token"
    });
  }
};

module.exports = {
  generateHmsToken
};
