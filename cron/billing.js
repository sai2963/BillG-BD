const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');

const prisma = new PrismaClient();

/**
 * Generate subscription bill number
 */
const generateSubscriptionBillNumber = async () => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  
  const datePrefix = `SUB${year}${month}`;
  
  const lastBill = await prisma.subscriptionBill.findFirst({
    where: {
      billNumber: {
        startsWith: datePrefix
      }
    },
    orderBy: {
      billNumber: 'desc'
    }
  });
  
  let sequence = 1;
  if (lastBill) {
    const lastSequence = parseInt(lastBill.billNumber.slice(-4));
    sequence = lastSequence + 1;
  }
  
  return `${datePrefix}${String(sequence).padStart(4, '0')}`;
};

/**
 * Process custom plan billing on 11th of every month
 */
async function processCustomPlanBilling() {
  console.log('Starting custom plan billing process...');
  
  try {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const previousMonth = month === 1 ? 12 : month - 1;
    const previousYear = month === 1 ? year - 1 : year;

    // Find all active custom plan subscriptions
    const customSubscriptions = await prisma.subscription.findMany({
      where: {
        planType: 'CUSTOM',
        status: 'ACTIVE'
      },
      include: {
        user: true
      }
    });

    console.log(`Found ${customSubscriptions.length} active custom plan subscriptions`);

    for (const subscription of customSubscriptions) {
      // Get usage for previous month
      const billsGenerated = await prisma.usageRecord.count({
        where: {
          userId: subscription.userId,
          month: previousMonth,
          year: previousYear
        }
      });

      // Skip if no bills generated
      if (billsGenerated === 0) {
        console.log(`No bills generated for user ${subscription.userId} in ${previousMonth}/${previousYear}`);
        continue;
      }

      // Check if bill already exists for this period
      const existingBill = await prisma.subscriptionBill.findFirst({
        where: {
          userId: subscription.userId,
          billingMonth: previousMonth,
          billingYear: previousYear
        }
      });

      if (existingBill) {
        console.log(`Bill already exists for user ${subscription.userId} for ${previousMonth}/${previousYear}`);
        continue;
      }

      // Calculate amount
      const amount = billsGenerated * 1; // ₹1 per bill

      // Generate bill number
      const billNumber = await generateSubscriptionBillNumber();

      // Set due date (15 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      // Create subscription bill
      await prisma.subscriptionBill.create({
        data: {
          userId: subscription.userId,
          billNumber,
          amount,
          planType: 'CUSTOM',
          billingMonth: previousMonth,
          billingYear: previousYear,
          billsCount: billsGenerated,
          status: 'PENDING',
          dueDate
        }
      });

      // Update subscription's next billing date
      const nextBillingDate = new Date(year, month, 11);
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          nextBillingDate,
          billsGenerated: 0 // Reset counter for next month
        }
      });

      console.log(`Created bill for user ${subscription.userId}: ${billsGenerated} bills × ₹1 = ₹${amount}`);
    }

    console.log('Custom plan billing process completed successfully');
  } catch (error) {
    console.error('Error in custom plan billing:', error);
  }
}

/**
 * Check and mark overdue bills
 */
async function checkOverdueBills() {
  console.log('Checking for overdue bills...');
  
  try {
    const now = new Date();

    // Find pending bills past due date
    const overdueBills = await prisma.subscriptionBill.updateMany({
      where: {
        status: 'PENDING',
        dueDate: {
          lt: now
        }
      },
      data: {
        status: 'OVERDUE'
      }
    });

    console.log(`Marked ${overdueBills.count} bills as overdue`);

    // Suspend subscriptions with overdue bills
    const usersWithOverdue = await prisma.subscriptionBill.findMany({
      where: {
        status: 'OVERDUE'
      },
      select: {
        userId: true
      },
      distinct: ['userId']
    });

    for (const { userId } of usersWithOverdue) {
      await prisma.subscription.updateMany({
        where: {
          userId,
          status: 'ACTIVE'
        },
        data: {
          status: 'SUSPENDED'
        }
      });
    }

    console.log(`Suspended subscriptions for ${usersWithOverdue.length} users with overdue bills`);
  } catch (error) {
    console.error('Error checking overdue bills:', error);
  }
}

/**
 * Check and expire subscriptions
 */
async function checkExpiredSubscriptions() {
  console.log('Checking for expired subscriptions...');
  
  try {
    const now = new Date();

    const expiredCount = await prisma.subscription.updateMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          not: null,
          lt: now
        }
      },
      data: {
        status: 'EXPIRED'
      }
    });

    console.log(`Marked ${expiredCount.count} subscriptions as expired`);
  } catch (error) {
    console.error('Error checking expired subscriptions:', error);
  }
}

/**
 * Initialize cron jobs
 */
function initializeCronJobs() {
  // Run custom plan billing on 11th of every month at 00:00
  cron.schedule('0 0 11 * *', () => {
    console.log('Running scheduled custom plan billing...');
    processCustomPlanBilling();
  });

  // Check for overdue bills daily at 01:00
  cron.schedule('0 1 * * *', () => {
    console.log('Running daily overdue bill check...');
    checkOverdueBills();
  });

  // Check for expired subscriptions every 6 hours
  cron.schedule('0 */6 * * *', () => {
    console.log('Running subscription expiry check...');
    checkExpiredSubscriptions();
  });

  console.log('Cron jobs initialized successfully');
  console.log('- Custom plan billing: 11th of each month at 00:00');
  console.log('- Overdue bill check: Daily at 01:00');
  console.log('- Subscription expiry check: Every 6 hours');
}

module.exports = {
  initializeCronJobs,
  processCustomPlanBilling,
  checkOverdueBills,
  checkExpiredSubscriptions
};