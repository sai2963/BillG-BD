const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const { checkSubscription } = require('../middleware/subscription');

const router = express.Router();
const prisma = new PrismaClient();

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// POST /api/subscriptions - Create new subscription
router.post('/', [
  checkSubscription,
  body('planType').isIn(['MONTHLY', 'ANNUAL', 'CUSTOM']).withMessage('Invalid plan type')
], handleValidationErrors, async (req, res) => {
  try {
    const { planType } = req.body;
    const userId = req.user.id;

    // Check if user already has an active subscription
    const existingSubscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE'
      }
    });

    if (existingSubscription) {
      return res.status(400).json({
        error: 'Active subscription exists',
        message: 'You already have an active subscription. Please cancel it before creating a new one.'
      });
    }

    // Calculate subscription details based on plan
    let amount, endDate, nextBillingDate;
    const startDate = new Date();

    switch (planType) {
      case 'MONTHLY':
        amount = 100;
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        nextBillingDate = new Date(endDate);
        break;
      
      case 'ANNUAL':
        amount = 500;
        endDate = new Date(startDate);
        endDate.setFullYear(endDate.getFullYear() + 1);
        nextBillingDate = new Date(endDate);
        break;
      
      case 'CUSTOM':
        amount = 0; // Will be calculated based on usage
        endDate = null; // No expiry for custom plan
        // Set next billing to 11th of next month
        nextBillingDate = new Date(startDate);
        nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);
        nextBillingDate.setDate(11);
        nextBillingDate.setHours(0, 0, 0, 0);
        break;
    }

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        planType,
        status: 'ACTIVE',
        amount,
        startDate,
        endDate,
        nextBillingDate,
        billsGenerated: 0
      }
    });

    res.status(201).json({
      message: 'Subscription created successfully',
      subscription
    });
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({
      error: 'Failed to create subscription',
      message: error.message
    });
  }
});

// GET /api/subscriptions/current - Get current user's active subscription
router.get('/current', checkSubscription, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'No active subscription',
        message: 'You do not have an active subscription'
      });
    }

    // Get usage stats for current month if custom plan
    let usageStats = null;
    if (subscription.planType === 'CUSTOM') {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();

      const usageCount = await prisma.usageRecord.count({
        where: {
          userId,
          month,
          year
        }
      });

      usageStats = {
        currentMonthBills: usageCount,
        currentMonthCost: usageCount * 1,
        nextBillingDate: subscription.nextBillingDate,
        billRate: 1
      };
    }

    res.json({
      subscription,
      usageStats
    });
  } catch (error) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription',
      message: error.message
    });
  }
});

// GET /api/subscriptions/bills - Get subscription billing history
router.get('/bills', checkSubscription, async (req, res) => {
  try {
    const userId = req.user.id;

    const bills = await prisma.subscriptionBill.findMany({
      where: { userId },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({ bills });
  } catch (error) {
    console.error('Error fetching subscription bills:', error);
    res.status(500).json({
      error: 'Failed to fetch subscription bills',
      message: error.message
    });
  }
});

// POST /api/subscriptions/cancel - Cancel current subscription
router.post('/cancel', checkSubscription, async (req, res) => {
  try {
    const userId = req.user.id;

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'ACTIVE'
      }
    });

    if (!subscription) {
      return res.status(404).json({
        error: 'No active subscription',
        message: 'You do not have an active subscription to cancel'
      });
    }

    // Check for unpaid bills
    const unpaidBills = await prisma.subscriptionBill.count({
      where: {
        userId,
        status: 'PENDING'
      }
    });

    if (unpaidBills > 0) {
      return res.status(400).json({
        error: 'Unpaid bills exist',
        message: 'Please clear all pending bills before cancelling your subscription',
        unpaidBills
      });
    }

    // Update subscription status
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        endDate: new Date()
      }
    });

    res.json({
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({
      error: 'Failed to cancel subscription',
      message: error.message
    });
  }
});

// GET /api/subscriptions/stats - Get usage statistics
router.get('/stats', checkSubscription, async (req, res) => {
  try {
    const userId = req.user.id;
    const now = new Date();

    // Get all-time stats
    const [totalBills, totalSpent] = await Promise.all([
      prisma.bill.count({
        where: { userId }
      }),
      prisma.subscriptionBill.aggregate({
        where: {
          userId,
          status: 'PAID'
        },
        _sum: {
          amount: true
        }
      })
    ]);

    // Get current month stats
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const monthlyBills = await prisma.usageRecord.count({
      where: {
        userId,
        month,
        year
      }
    });

    // Get last 6 months usage for custom plan users
    const monthlyUsage = [];
    if (req.subscription.planType === 'CUSTOM') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const m = d.getMonth() + 1;
        const y = d.getFullYear();

        const count = await prisma.usageRecord.count({
          where: {
            userId,
            month: m,
            year: y
          }
        });

        monthlyUsage.push({
          month: m,
          year: y,
          billsGenerated: count,
          cost: count * 1
        });
      }
    }

    res.json({
      allTime: {
        totalBills,
        totalSpent: totalSpent._sum.amount || 0
      },
      currentMonth: {
        billsGenerated: monthlyBills,
        estimatedCost: req.subscription.planType === 'CUSTOM' ? monthlyBills * 1 : 0
      },
      monthlyUsage
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      error: 'Failed to fetch statistics',
      message: error.message
    });
  }
});

module.exports = router;