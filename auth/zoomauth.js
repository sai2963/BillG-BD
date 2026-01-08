const axios = require("axios");

exports.getZoomAccessToken = async () => {
  try {
    const response = await axios.post(
      "https://zoom.us/oauth/token",
      null,
      {
        params: {
          grant_type: "account_credentials",
          account_id: process.env.ZOOM_ACCOUNT_ID,
        },
        auth: {
          username: process.env.ZOOM_CLIENT_ID,
          password: process.env.ZOOM_CLIENT_SECRET,
        },
      }
    );

    return response.data.access_token;
  } catch (error) {
    console.error(
      "Zoom Auth Error:",
      error.response?.data || error.message
    );
    throw new Error("Failed to get Zoom access token");
  }
};
