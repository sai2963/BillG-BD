const express = require("express");
const Stripe = require("stripe");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

router.post("/", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("❌ Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log("✅ Webhook received:", event.type);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const billId = session.metadata.billId;

    await prisma.bill.update({
      where: { id: billId },
      data: {
        paymentStatus: "PAID",
        transactionId: session.payment_intent,
        paidAt: new Date(),
        paymentMethod: "CARD"
      }
    });

    console.log("💰 Payment Successful");
    console.log("Bill ID:", billId);
    console.log("Transaction ID:", session.payment_intent);
  }

  res.json({ received: true });
});

module.exports = router;
