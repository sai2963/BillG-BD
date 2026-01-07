const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const productRoutes = require("./routes/products");
const billRoutes = require("./routes/bills");
const customerRoutes = require("./routes/customers");
const checkoutRoutes = require("./routes/checkout");
const webhookRoutes = require("./routes/webhook");

const app = express();
const PORT = process.env.PORT || 5000;

// Security
app.use(helmet());

// Rate limit
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  })
);

// CORS
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://bill-g.vercel.app",
    ],
    credentials: true,
  })
);

// 🔥 WEBHOOK — MUST COME BEFORE express.json
app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  webhookRoutes
);

// ❌ DO NOT parse JSON before webhook
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logger
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/products", productRoutes);
app.use("/api/bills", billRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/checkout", checkoutRoutes);

// Health
app.get("/api/health", (req, res) => {
  res.json({ status: "OK" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
