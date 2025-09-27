// models/Product.js
const { PrismaClient } = require('@prisma/client');

class ProductModel {
  constructor() {
    this.prisma = new PrismaClient();
  }

  async findMany(options = {}) {
    const {
      where = {},
      skip = 0,
      take = 50,
      orderBy = { createdAt: 'desc' }
    } = options;

    return await this.prisma.product.findMany({
      where,
      skip,
      take,
      orderBy
    });
  }

  async count(where = {}) {
    return await this.prisma.product.count({ where });
  }

  async findById(id) {
    return await this.prisma.product.findUnique({
      where: { id }
    });
  }

  async create(data) {
    return await this.prisma.product.create({ data });
  }

  async update(id, data) {
    return await this.prisma.product.update({
      where: { id },
      data
    });
  }

  async delete(id) {
    return await this.prisma.product.delete({
      where: { id }
    });
  }

  async getCategories() {
    const categories = await this.prisma.product.findMany({
      where: {
        category: {
          not: null
        }
      },
      select: {
        category: true
      },
      distinct: ['category']
    });

    return categories.map(item => item.category).filter(Boolean);
  }

  buildSearchFilter(search, category) {
    const where = {};
    
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (category) {
      where.category = { contains: category, mode: 'insensitive' };
    }

    return where;
  }
}

module.exports = ProductModel;