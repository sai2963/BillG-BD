const express = require("express");
const { body, validationResult } = require("express-validator");
const { PrismaClient } = require("@prisma/client");
const { clerkClient } = require("@clerk/clerk-sdk-node");

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

// Helper function to get user from token - FIXED VERSION
const getUserFromToken = async (req) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("NO_TOKEN");
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify the session token with Clerk
    const verifiedToken = await clerkClient.verifyToken(token);
    const clerkUserId = verifiedToken.sub;

    console.log("Verified Clerk User ID:", clerkUserId);

    // Find or create user in database
    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUserId },
    });

    if (!user) {
      console.log("User not found in database, fetching from Clerk...");

      // Get user details from Clerk
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      console.log("Fetched Clerk user:", clerkUser.id);

      user = await prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0].emailAddress,
          firstName: clerkUser.firstName || "",
          lastName: clerkUser.lastName || "",
        },
      });

      console.log("Created new user in database:", user.id);
    }

    return user;
  } catch (error) {
    console.error("getUserFromToken error:", error.message);
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
      console.log("Creating subscription for plan:", planType);

      const user = await getUserFromToken(req);
      console.log("User authenticated:", user.id);

      // Check for existing active subscription
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

      console.log("Subscription created successfully:", subscription.id);

      res.status(201).json({
        message: "Subscription created successfully",
        subscription,
      });
    } catch (error) {
      console.error("Create subscription error:", error);

      if (error.message === "NO_TOKEN") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "No authentication token provided",
          code: "NO_TOKEN"
        });
      }

      if (error.message === "INVALID_TOKEN") {
        return res.status(401).json({
          error: "Unauthorized",
          message: "Invalid or expired token",
          code: "INVALID_TOKEN"
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
    console.error("Get subscription error:", error);
    
    if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch subscription",
      message: error.message 
    });
  }
});

// GET /api/subscriptions/bills - Get subscription bills
router.get("/bills", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    
    const bills = await prisma.subscriptionBill.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    
    res.json({ bills });
  } catch (error) {
    console.error("Get bills error:", error);
    
    if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch bills",
      message: error.message 
    });
  }
});

// GET /api/subscriptions/stats - Get usage statistics
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
      allTime: { 
        totalBills, 
        totalSpent: totalSpent._sum.amount || 0 
      },
      currentMonth: {
        billsGenerated: monthlyBills,
        estimatedCost: subscription?.planType === "CUSTOM" ? monthlyBills : 0,
      },
      monthlyUsage: [],
    });
  } catch (error) {
    console.error("Get stats error:", error);
    
    if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    
    res.status(500).json({ 
      error: "Failed to fetch statistics",
      message: error.message 
    });
  }
});

// POST /api/subscriptions/cancel - Cancel subscription
router.post("/cancel", async (req, res) => {
  try {
    const user = await getUserFromToken(req);
    
    const subscription = await prisma.subscription.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
    });

    if (!subscription) {
      return res.status(404).json({ 
        error: "No active subscription",
        message: "You do not have an active subscription to cancel"
      });
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { 
        status: "CANCELLED", 
        endDate: new Date() 
      },
    });

    res.json({ message: "Subscription cancelled successfully" });
  } catch (error) {
    console.error("Cancel subscription error:", error);
    
    if (error.message === "NO_TOKEN" || error.message === "INVALID_TOKEN") {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication required",
      });
    }
    
    res.status(500).json({ 
      error: "Failed to cancel subscription",
      message: error.message 
    });
  }
});

module.exports = router;