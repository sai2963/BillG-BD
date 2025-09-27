// models/Bill.js
const { PrismaClient } = require('@prisma/client');

class BillModel {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async findMany(options = {}) {
    const {
      where = {},
      skip = 0,
      take = 20,
      include = {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      },
      orderBy = { createdAt: 'desc' }
    } = options;

    return await this.prisma.bill.findMany({
      where,
      skip,
      take,
      include,
      orderBy
    });
  }

  async count(where = {}) {
    return await this.prisma.bill.count({ where });
  }

  async findById(id) {
    return await this.prisma.bill.findUnique({
      where: { id },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  async create(data) {
    return await this.prisma.bill.create({
      data,
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  async update(id, data) {
    return await this.prisma.bill.update({
      where: { id },
      data,
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });
  }

  async generateBillNumber() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const datePrefix = `BILL${year}${month}${day}`;
    
    const lastBill = await this.prisma.bill.findFirst({
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
  }

  async getDashboardStats(dateFilter) {
    const [
      totalBills,
      totalRevenue,
      paidBills,
      pendingBills,
      todayBills,
      todayRevenue
    ] = await Promise.all([
      this.prisma.bill.count({ where: dateFilter }),
      
      this.prisma.bill.aggregate({
        where: dateFilter,
        _sum: { finalAmount: true }
      }),
      
      this.prisma.bill.count({
        where: { ...dateFilter, paymentStatus: 'PAID' }
      }),
      
      this.prisma.bill.count({
        where: { ...dateFilter, paymentStatus: 'PENDING' }
      }),
      
      this.prisma.bill.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999))
          }
        }
      }),
      
      this.prisma.bill.aggregate({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999))
          }
        },
        _sum: { finalAmount: true }
      })
    ]);

    return {
      totalBills,
      totalRevenue: totalRevenue._sum.finalAmount || 0,
      paidBills,
      pendingBills,
      todayBills,
      todayRevenue: todayRevenue._sum.finalAmount || 0
    };
  }

  async getTopProducts(dateFilter) {
    const topProducts = await this.prisma.billItem.groupBy({
      by: ['productId'],
      where: { bill: dateFilter },
      _sum: {
        quantity: true,
        totalPrice: true
      },
      orderBy: {
        _sum: { quantity: 'desc' }
      },
      take: 5
    });

    return await Promise.all(
      topProducts.map(async (item) => {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
          select: { title: true, price: true }
        });
        return {
          product,
          quantitySold: item._sum.quantity,
          revenue: item._sum.totalPrice
        };
      })
    );
  }

  buildSearchFilter(search, status, startDate, endDate) {
    const where = {};
    
    if (search) {
      where.OR = [
        { billNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { customer: { mobileNumber: { contains: search, mode: 'insensitive' } } }
      ];
    }
    
    if (status) {
      where.paymentStatus = status;
    }

    if (startDate && endDate) {
      where.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    } else if (startDate) {
      where.createdAt = { gte: new Date(startDate) };
    } else if (endDate) {
      where.createdAt = { lte: new Date(endDate) };
    }

    return where;
  }

  buildDateFilter(startDate, endDate) {
    if (startDate && endDate) {
      return {
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate)
        }
      };
    }
    
    // Default to current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    
    return {
      createdAt: {
        gte: startOfMonth,
        lte: endOfMonth
      }
    };
  }

  async executeTransaction(callback) {
    return await this.prisma.$transaction(callback);
  }
}

module.exports = BillModel;