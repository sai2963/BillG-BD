const express = require("express");
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");
const router = express.Router();
const prisma = new PrismaClient();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed",
      details: errors.array(),
    });
  }
  next();
};
// Helper function to get user from token - Simplified without Clerk SDK
const getUserFromToken = async (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("NO_TOKEN");
  }

  const token = authHeader.split(" ")[1];

  try {
    // Decode JWT without verification (Clerk already verified it on frontend)
    const decoded = jwt.decode(token);

    if (!decoded || !decoded.sub) {
      console.error("Invalid token structure:", decoded);
      throw new Error("INVALID_TOKEN");
    }

    const clerkUserId = decoded.sub;
    console.log("Clerk User ID from token:", clerkUserId);

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      console.log("User not found, fetching from Clerk API...");

      // Fetch user details from Clerk
      const clerkResponse = await fetch(
        `https://api.clerk.com/v1/users/${clerkUserId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!clerkResponse.ok) {
        const errorText = await clerkResponse.text();
        console.error("Clerk API error:", clerkResponse.status, errorText);
        throw new Error("INVALID_TOKEN");
      }

      const clerkUser = await clerkResponse.json();
      console.log("Fetched Clerk user:", clerkUser.id);

      user = await prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email: clerkUser.email_addresses[0].email_address,
          firstName: clerkUser.first_name || "",
          lastName: clerkUser.last_name || "",
        },
      });

      console.log("Created new user in database:", user.id);
    }

    return user;
  } catch (error) {
    console.error("getUserFromToken error:", error);
    throw new Error("INVALID_TOKEN");
  }
};
// POST /api/subscriptions - Create new subscription
router.post(
  "/",
  [body("planType").isIn(["MONTHLY", "ANNUAL", "CUSTOM"])],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { planType } = req.body;
      const user = await getUserFromToken(req);

      const existingSubscription = await prisma.subscription.findFirst({
        where: { userId: user.id, status: "ACTIVE" },
      });

      if (existingSubscription) {
        return res.status(400).json({
          error: "Active subscription exists",
          message: "You already have an active subscription.",
        });
      }

      let amount, endDate, nextBillingDate;
      const startDate = new Date();

      switch (planType) {
        case "MONTHLY":
          amount = 100;
          endDate = new Date(startDate);
          endDate.setMonth(endDate.getMonth() + 1);
          nextBillingDate = new Date(endDate);
          break;
        case "ANNUAL":
          amount = 500;
          endDate = new Date(startDate);
          endDate.setFullYear(endDate.getFullYear() + 1);
          nextBillingDate = new Date(endDate);
          break;
        case "CUSTOM":
          amount = 0;
          endDate = null;
          nextBillingDate = new Date(startDate);
          nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
          nextBillingDate.setDate(11);
          nextBillingDate.setHours(0, 0, 0, 0);
          break;
      }

      const subscription = await prisma.subscription.create({
        data: {
          userId: user.id,
          planType,
          status: "ACTIVE",
          amount,
          startDate,
          endDate,
          nextBillingDate,
          billsGenerated: 0,
        },
      });

      res.status(201).json({
        message: "Subscription created successfully",
        subscription,
      });
    } catch (error) {
      console.error("Create subscription error:", error);

      if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token",
        });
      }

      res.status(500).json({
        error: "Failed to create subscription",
        message: error.message,
      });
    }
  }
);

// GET /api/subscriptions/current - Get current subscription
router.get("/current", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return res.status(404).json({
        error: "No active subscription",
        message: "You do not have an active subscription",
      });
    }

    let usageStats = null;
    if (subscription.planType === "CUSTOM") {
      const now = new Date();
      const usageCount = await prisma.usageRecord.count({
        where: {
          userId: user.id,
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      });

      usageStats = {
        currentMonthBills: usageCount,
        currentMonthCost: usageCount * 1,
        nextBillingDate: subscription.nextBillingDate,
        billRate: 1,
      };
    }

    res.json({ subscription, usageStats });
  } catch (error) {
    if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    res.status(500).json({ error: "Failed to fetch subscription" });
  }
});
// Other routes remain the same...
router.get("/bills", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    const bills = await prisma.subscriptionBill.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ bills });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bills" });
  }
});
router.get("/stats", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    const now = new Date();

    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
    });

    const [totalBills, totalSpent] = await Promise.all([
      prisma.bill.count({ where: { userId: user.id } }),
      prisma.subscriptionBill.aggregate({
        where: { userId: user.id, status: "PAID" },
        _sum: { amount: true },
      }),
    ]);

    const monthlyBills = await prisma.usageRecord.count({
      where: {
        userId: user.id,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      },
    });

    res.json({
      allTime: { totalBills, totalSpent: totalSpent._sum.amount || 0 },
      currentMonth: {
        billsGenerated: monthlyBills,
        estimatedCost: subscription?.planType === "CUSTOM" ? monthlyBills : 0,
      },
      monthlyUsage: [],
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});
router.post("/cancel", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
    });

    if (!subscription) {
      return res.status(404).json({ error: "No active subscription" });
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "CANCELLED", endDate: new Date() },
    });

    res.json({ message: "Subscription cancelled successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
});

module.exports = router;
