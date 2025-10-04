const { PrismaClient } = require('@prisma/client');
const { clerkClient } = require('@clerk/clerk-sdk-node');

const prisma = new PrismaClient();

/**
 * Middleware to check if user has an active subscription
 * Extracts Clerk userId from Authorization header and validates subscription
 */
const checkSubscription = async (req, res, next) => {
  try {
    // Get Clerk session token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    const token = authHeader.split(' ')[1];
    
    // Verify token with Clerk
    let clerkUser;
    try {
      // Verify the session token
      const session = await clerkClient.verifyToken(token);
      clerkUser = await clerkClient.users.getUser(session.sub);
    } catch (error) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Get or create user in database
    let user = await prisma.user.findUnique({
      where: { clerkId: clerkUser.id },
      include: {
        subscriptions: {
          where: {
            status: 'ACTIVE'
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 1
        }
      }
    });

    if (!user) {
      // Create user if doesn't exist
      user = await prisma.user.create({
        data: {
          clerkId: clerkUser.id,
          email: clerkUser.emailAddresses[0].emailAddress,
          firstName: clerkUser.firstName,
          lastName: clerkUser.lastName
        },
        include: {
          subscriptions: true
        }
      });
    }

    // Check if user has an active subscription
    const activeSubscription = user.subscriptions[0];

    if (!activeSubscription) {
      return res.status(403).json({
        error: 'No Active Subscription',
        message: 'You need an active subscription to access this feature',
        code: 'NO_SUBSCRIPTION',
        redirect: '/pricing'
      });
    }

    // Check if subscription is expired
    if (activeSubscription.endDate && new Date() > new Date(activeSubscription.endDate)) {
      // Mark subscription as expired
      await prisma.subscription.update({
        where: { id: activeSubscription.id },
        data: { status: 'EXPIRED' }
      });

      return res.status(403).json({
        error: 'Subscription Expired',
        message: 'Your subscription has expired. Please renew to continue.',
        code: 'SUBSCRIPTION_EXPIRED',
        redirect: '/pricing'
      });
    }

    // Check for custom plan unpaid bills
    if (activeSubscription.planType === 'CUSTOM') {
      const unpaidBills = await prisma.subscriptionBill.findMany({
        where: {
          userId: user.id,
          status: 'PENDING',
          dueDate: {
            lt: new Date()
          }
        }
      });

      if (unpaidBills.length > 0) {
        return res.status(403).json({
          error: 'Payment Required',
          message: 'You have unpaid subscription bills. Please clear your dues to continue.',
          code: 'UNPAID_BILLS',
          unpaidBills: unpaidBills.length,
          redirect: '/subscription/payment'
        });
      }
    }

    // Attach user and subscription info to request
    req.user = user;
    req.subscription = activeSubscription;

    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({
      error: 'Server error',
      message: 'Failed to verify subscription status'
    });
  }
};

/**
 * Middleware to track bill creation for custom plan users
 */
const trackBillUsage = async (req, res, next) => {
  // Store the original json method
  const originalJson = res.json;

  // Override res.json
  res.json = function (data) {
    // Only track if bill was successfully created
    if (res.statusCode === 201 && data.bill && req.user && req.subscription) {
      // Track usage asynchronously (don't wait for it)
      trackUsage(req.user.id, data.bill.id, req.subscription).catch(error => {
        console.error('Error tracking usage:', error);
      });
    }

    // Call the original json method
    return originalJson.call(this, data);
  };

  next();
};

/**
 * Track bill usage for subscription billing
 */
async function trackUsage(userId, billId, subscription) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  // Create usage record
  await prisma.usageRecord.create({
    data: {
      userId,
      billId,
      month,
      year
    }
  });

  // Update subscription bill count if custom plan
  if (subscription.planType === 'CUSTOM') {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        billsGenerated: {
          increment: 1
        }
      }
    });
  }
}

module.exports = {
  checkSubscription,
  trackBillUsage
};