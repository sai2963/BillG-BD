const axios = require("axios");
const { getZoomAccessToken } = require("../auth/zoomauth");

exports.createZoomMeeting = async (req, res) => {
  try {
    const token = await getZoomAccessToken();

    const response = await axios.post(
      "https://api.zoom.us/v2/users/me/meetings",
      {
        topic: "React Zoom Meeting",
        type: 2,
        duration: 30,
        settings: {
          host_video: true,
          participant_video: true,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    // ✅ Send only what frontend needs
    res.status(200).json({
      meetingId: response.data.id,
      joinUrl: response.data.join_url,
    });

  } catch (error) {
    console.error("Zoom Error:", error.response?.data || error.message);

    res.status(500).json({
      error: "Failed to create Zoom meeting",
    });
  }
};
