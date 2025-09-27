// models/Customer.js
const { PrismaClient } = require('@prisma/client');

class CustomerModel {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async findMany(options = {}) {
    const {
      where = {},
      skip = 0,
      take = 20,
      include = {
        _count: {
          select: { bills: true }
        },
        bills: {
          select: { finalAmount: true }
        }
      },
      orderBy = { createdAt: 'desc' }
    } = options;

    return await this.prisma.customer.findMany({
      where,
      skip,
      take,
      include,
      orderBy
    });
  }

  async count(where = {}) {
    return await this.prisma.customer.count({ where });
  }

  async findById(id) {
    return await this.prisma.customer.findUnique({
      where: { id },
      include: {
        bills: {
          include: {
            items: {
              include: {
                product: {
                  select: {
                    title: true,
                    price: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });
  }

  async findByNameAndMobile(name, mobileNumber) {
    return await this.prisma.customer.findFirst({
      where: {
        AND: [
          { name: name },
          { mobileNumber: mobileNumber }
        ]
      }
    });
  }

  async create(data) {
    return await this.prisma.customer.create({ data });
  }

  async update(id, data) {
    return await this.prisma.customer.update({
      where: { id },
      data
    });
  }

  async delete(id) {
    return await this.prisma.customer.delete({
      where: { id }
    });
  }

  async findWithBillCount(id) {
    return await this.prisma.customer.findUnique({
      where: { id },
      include: {
        _count: {
          select: { bills: true }
        }
      }
    });
  }

  buildSearchFilter(search) {
    if (!search) return {};
    
    return {
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { mobileNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ]
    };
  }

  calculateCustomerStats(customer) {
    const totalSpent = customer.bills?.reduce((sum, bill) => sum + bill.finalAmount, 0) || 0;
    const totalBills = customer.bills?.length || 0;

    return {
      totalSpent,
      totalBills
    };
  }

  formatCustomersWithStats(customers) {
    return customers.map(customer => ({
      ...customer,
      totalSpent: customer.bills.reduce((sum, bill) => sum + bill.finalAmount, 0),
      bills: undefined // Remove bills array from response
    }));
  }
}

module.exports = CustomerModel;