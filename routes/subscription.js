const express = require("express");
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");

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
    // Call Clerk API directly to verify token and get user
    const response = await fetch("https://api.clerk.com/v1/sessions/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new Error("INVALID_TOKEN");
    }

    const sessionData = await response.json();
    const clerkUserId = sessionData.user_id;

    // Get full user details
    const userResponse = await fetch(
      `https://api.clerk.com/v1/users/${clerkUserId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        },
      }
    );

    if (!userResponse.ok) {
      throw new Error("INVALID_TOKEN");
    }

    const clerkUser = await userResponse.json();

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email: clerkUser.email_addresses[0].email_address,
          firstName: clerkUser.first_name || "",
          lastName: clerkUser.last_name || "",
        },
      });
    }

    return user;
  } catch (error) {
    console.error("Token verification error:", error);
    throw new Error("INVALID_TOKEN");
  }
};

// POST /api/subscriptions - Create new subscription
router.post(
  "/",
  [
    body("planType")
      .isIn(["MONTHLY", "ANNUAL", "CUSTOM"])
      .withMessage("Invalid plan type"),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { planType } = req.body;

      // Get user from token
      const user = await getUserFromToken(req);
      const userId = user.id;

      // Check if user already has an active subscription
      const existingSubscription = await prisma.subscription.findFirst({
        where: {
          userId,
          status: "ACTIVE",
        },
      });

      if (existingSubscription) {
        return res.status(400).json({
          error: "Active subscription exists",
          message:
            "You already have an active subscription. Please cancel it before creating a new one.",
        });
      }

      // Calculate subscription details based on plan
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

        default:
          return res.status(400).json({
            error: "Invalid plan type",
            message: "Plan type must be MONTHLY, ANNUAL, or CUSTOM",
          });
      }

      // Create subscription
      const subscription = await prisma.subscription.create({
        data: {
          userId,
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
      console.error("Error creating subscription:", error);

      if (error.message === "NO_TOKEN") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "No authentication token provided",
        });
      }

      if (error.message === "INVALID_TOKEN") {
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
      where: {
        userId: user.id,
        status: "ACTIVE",
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (!subscription) {
      return res.status(404).json({
        error: "No active subscription",
        message: "You do not have an active subscription",
      });
    }

    // Get usage stats for current month if custom plan
    let usageStats = null;
    if (subscription.planType === "CUSTOM") {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const usageCount = await prisma.usageRecord.count({
        where: {
          userId: user.id,
          month,
          year,
        },
      });

      usageStats = {
        currentMonthBills: usageCount,
        currentMonthCost: usageCount * 1,
        nextBillingDate: subscription.nextBillingDate,
        billRate: 1,
      };
    }

    res.json({
      subscription,
      usageStats,
    });
  } catch (error) {
    console.error("Error fetching subscription:", error);

    if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }

    res.status(500).json({
      error: "Failed to fetch subscription",
      message: error.message,
    });
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
    res
      .status(500)
      .json({
        error: "Failed to fetch subscription bills",
        message: error.message,
      });
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
    res
      .status(500)
      .json({ error: "Failed to cancel subscription", message: error.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

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
      where: { userId: user.id, month, year },
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
    res
      .status(500)
      .json({ error: "Failed to fetch statistics", message: error.message });
  }
});

module.exports = router;
