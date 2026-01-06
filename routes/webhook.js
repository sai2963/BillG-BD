const express = require("express");
const Stripe = require("stripe");

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/", (req, res) => {
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    console.log("💰 Payment Successful");
    console.log("Transaction ID:", session.payment_intent);
    console.log("Amount Paid:", session.amount_total / 100);
    console.log("Bill ID:", session.metadata.billId);

    // 🔥 UPDATE DATABASE HERE
    // bill.paymentStatus = "PAID"
    // bill.transactionId = session.payment_intent
  }

  res.json({ received: true });
});

module.exports = router;
