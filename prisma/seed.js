const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const sampleProducts = [
  {
    title: "iPhone 13",
    description: "Latest Apple iPhone with advanced features",
    price: 79999,
    category: "Electronics",
    brand: "Apple",
    stock: 50,
    rating: 4.5,
    thumbnail: "https://via.placeholder.com/300x300/007bff/fff?text=iPhone+13",
    images: ["https://via.placeholder.com/300x300/007bff/fff?text=iPhone+13"],
    tags: ["smartphone", "apple", "mobile"],
    warrantyInformation: "1 year Apple warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "30 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Samsung Galaxy S21",
    description: "Premium Android smartphone",
    price: 69999,
    category: "Electronics",
    brand: "Samsung",
    stock: 30,
    rating: 4.3,
    thumbnail: "https://via.placeholder.com/300x300/28a745/fff?text=Galaxy+S21",
    images: ["https://via.placeholder.com/300x300/28a745/fff?text=Galaxy+S21"],
    tags: ["smartphone", "samsung", "android"],
    warrantyInformation: "1 year Samsung warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "30 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Dell XPS 13 Laptop",
    description: "Ultra-thin laptop for professionals",
    price: 89999,
    category: "Computers",
    brand: "Dell",
    stock: 15,
    rating: 4.4,
    thumbnail: "https://via.placeholder.com/300x300/6c757d/fff?text=Dell+XPS+13",
    images: ["https://via.placeholder.com/300x300/6c757d/fff?text=Dell+XPS+13"],
    tags: ["laptop", "dell", "computer"],
    warrantyInformation: "2 years Dell warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "15 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Nike Air Max 270",
    description: "Comfortable running shoes",
    price: 12999,
    category: "Footwear",
    brand: "Nike",
    stock: 100,
    rating: 4.2,
    thumbnail: "https://via.placeholder.com/300x300/dc3545/fff?text=Nike+Air+Max",
    images: ["https://via.placeholder.com/300x300/dc3545/fff?text=Nike+Air+Max"],
    tags: ["shoes", "nike", "running"],
    warrantyInformation: "6 months warranty",
    shippingInformation: "Standard shipping",
    returnPolicy: "30 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Adidas Ultraboost 22",
    description: "Premium running shoes with boost technology",
    price: 17999,
    category: "Footwear",
    brand: "Adidas",
    stock: 75,
    rating: 4.6,
    thumbnail: "https://via.placeholder.com/300x300/ffc107/000?text=Ultraboost+22",
    images: ["https://via.placeholder.com/300x300/ffc107/000?text=Ultraboost+22"],
    tags: ["shoes", "adidas", "running", "boost"],
    warrantyInformation: "6 months warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "30 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Sony WH-1000XM4 Headphones",
    description: "Wireless noise-canceling headphones",
    price: 29999,
    category: "Audio",
    brand: "Sony",
    stock: 40,
    rating: 4.7,
    thumbnail: "https://via.placeholder.com/300x300/17a2b8/fff?text=Sony+WH-1000XM4",
    images: ["https://via.placeholder.com/300x300/17a2b8/fff?text=Sony+WH-1000XM4"],
    tags: ["headphones", "sony", "wireless", "noise-canceling"],
    warrantyInformation: "1 year Sony warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "30 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Levi's 501 Original Jeans",
    description: "Classic straight leg jeans",
    price: 4999,
    category: "Clothing",
    brand: "Levi's",
    stock: 200,
    rating: 4.1,
    thumbnail: "https://via.placeholder.com/300x300/6610f2/fff?text=Levi%27s+501",
    images: ["https://via.placeholder.com/300x300/6610f2/fff?text=Levi%27s+501"],
    tags: ["jeans", "levis", "denim", "clothing"],
    warrantyInformation: "No warranty",
    shippingInformation: "Standard shipping",
    returnPolicy: "30 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Canon EOS R5 Camera",
    description: "Professional mirrorless camera",
    price: 329999,
    category: "Cameras",
    brand: "Canon",
    stock: 5,
    rating: 4.8,
    thumbnail: "https://via.placeholder.com/300x300/fd7e14/fff?text=Canon+EOS+R5",
    images: ["https://via.placeholder.com/300x300/fd7e14/fff?text=Canon+EOS+R5"],
    tags: ["camera", "canon", "mirrorless", "professional"],
    warrantyInformation: "2 years Canon warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "15 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Apple MacBook Pro 14-inch",
    description: "Professional laptop with M2 Pro chip",
    price: 199999,
    category: "Computers",
    brand: "Apple",
    stock: 10,
    rating: 4.9,
    thumbnail: "https://via.placeholder.com/300x300/20c997/fff?text=MacBook+Pro",
    images: ["https://via.placeholder.com/300x300/20c997/fff?text=MacBook+Pro"],
    tags: ["laptop", "apple", "macbook", "m2"],
    warrantyInformation: "1 year Apple warranty",
    shippingInformation: "Free shipping",
    returnPolicy: "15 days return",
    availabilityStatus: "In Stock"
  },
  {
    title: "Samsung 55-inch 4K Smart TV",
    description: "Ultra HD Smart TV with HDR",
    price: 54999,
    category: "Electronics",
    brand: "Samsung",
    stock: 20,
    rating: 4.3,
    thumbnail: "https://via.placeholder.com/300x300/e83e8c/fff?text=Samsung+TV",
    images: ["https://via.placeholder.com/300x300/e83e8c/fff?text=Samsung+TV"],
    tags: ["tv", "samsung", "smart", "4k"],
    warrantyInformation: "3 years Samsung warranty",
    shippingInformation: "Free installation",
    returnPolicy: "7 days return",
    availabilityStatus: "In Stock"
  }
];

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data (optional - be careful in production!)
  console.log('🗑️ Clearing existing data...');
  await prisma.billItem.deleteMany({});
  await prisma.bill.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.customer.deleteMany({});

  // Create products
  console.log('📦 Creating products...');
  const createdProducts = [];
  
  for (const productData of sampleProducts) {
    const product = await prisma.product.create({
      data: productData
    });
    createdProducts.push(product);
    console.log(`✅ Created product: ${product.title}`);
  }

  // Create sample customers
  console.log('👥 Creating sample customers...');
  const sampleCustomers = [
    {
      name: "Rajesh Kumar",
      mobileNumber: "9876543210",
      email: "rajesh@example.com",
      address: "123 Main St, Mumbai, Maharashtra"
    },
    {
      name: "Priya Sharma",
      mobileNumber: "8765432109",
      email: "priya@example.com",
      address: "456 Park Ave, Delhi, NCR"
    },
    {
      name: "Amit Patel",
      mobileNumber: "7654321098",
      email: "amit@example.com",
      address: "789 Garden Rd, Bangalore, Karnataka"
    }
  ];

  const createdCustomers = [];
  for (const customerData of sampleCustomers) {
    const customer = await prisma.customer.create({
      data: customerData
    });
    createdCustomers.push(customer);
    console.log(`✅ Created customer: ${customer.name}`);
  }

  // Create sample bills
  console.log('🧾 Creating sample bills...');
  
  // Generate bill number function (same as in routes)
  const generateBillNumber = async () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const datePrefix = `BILL${year}${month}${day}`;
    
    const lastBill = await prisma.bill.findFirst({
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

  // Create a few sample bills
  for (let i = 0; i < 3; i++) {
    const customer = createdCustomers[i];
    const selectedProducts = createdProducts.slice(i * 2, (i * 2) + 2); // 2 products per bill
    
    let totalAmount = 0;
    const billItems = selectedProducts.map(product => {
      const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 items
      const itemTotal = product.price * quantity;
      totalAmount += itemTotal;
      
      return {
        productId: product.id,
        quantity,
        unitPrice: product.price,
        totalPrice: itemTotal
      };
    });

    const discountPercent = i * 5; // 0%, 5%, 10% discount
    const discountAmount = (totalAmount * discountPercent) / 100;
    const finalAmount = totalAmount - discountAmount;
    const billNumber = await generateBillNumber();

    const bill = await prisma.bill.create({
      data: {
        billNumber,
        customerId: customer.id,
        totalAmount,
        discountPercent,
        discountAmount,
        finalAmount,
        paymentStatus: i === 0 ? 'PAID' : 'PENDING',
        paymentMethod: 'CASH',
        items: {
          create: billItems
        }
      },
      include: {
        customer: true,
        items: {
          include: {
            product: true
          }
        }
      }
    });

    console.log(`✅ Created bill: ${bill.billNumber} for ${customer.name}`);
  }

  console.log('✨ Database seeding completed successfully!');
  console.log(`📊 Created:`);
  console.log(`   - ${createdProducts.length} products`);
  console.log(`   - ${createdCustomers.length} customers`);
  console.log(`   - 3 sample bills`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });