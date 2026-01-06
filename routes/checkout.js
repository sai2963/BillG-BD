const express = require("express");
const Stripe = require("stripe");

const router = express.Router();

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/checkout
 * Creates a Stripe Checkout Session
 */
router.post("/", async (req, res) => {
  try {
    const { cartItems ,billId } = req.body;

    // ✅ Validate input
    if (!cartItems || !Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        error: "Cart items are required",
      });
    }

    // ✅ Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",

      line_items: cartItems.map((item) => {
        if (!item.name || !item.price || !item.qty) {
          throw new Error("Invalid cart item data");
        }

        return {
          price_data: {
            currency: "inr",
            product_data: {
              name: item.name,
            },
            // Stripe requires amount in smallest currency unit (paise)
            unit_amount: Math.round(Number(item.price) * 100),
          },
          quantity: Number(item.qty),
        };
      }),


      metadata: {
        billId: billId,   
      },

      success_url: `${process.env.CLIENT_URL}/success/${billId}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/cancel`,
    });

    // ✅ Send Stripe Checkout URL to frontend
    res.status(200).json({
      url: session.url,
    });
  } catch (error) {
    console.error("Stripe Checkout Error:", error.message);

    res.status(500).json({
      error: error.message || "Stripe checkout failed",
    });
  }
});

module.exports = router;
