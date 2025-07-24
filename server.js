const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;

const app = express();
app.use(cors());
app.use(express.json());

// ===== MongoDB Connection =====
mongoose.connect(
  "mongodb+srv://sailendrakondapalli:123@cluster0.mmvjkog.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
  { useNewUrlParser: true, useUnifiedTopology: true }
).then(() => console.log("✅ MongoDB connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err));

// ====== Cloudinary Config ======
cloudinary.config({
  cloud_name: "dgji6lwc9",
  api_key: "991287451317225",
  api_secret: "U6_VNnwk3i6EgQ1EKsxEZhQ0k44",
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "AllInOneCart",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [{ width: 500, height: 500, crop: "limit" }],
  },
});
const upload = multer({ storage });

// ====== Mongoose Schemas ======
const productSchema = new mongoose.Schema({
  name: String,
  cost: Number,
  store: String,
  stock: String,
  src: String,
  category: String,
  adminEmail: String,
  adminName: String,
  city: String,
  unit: String, 
  
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  city: String,
  role: String, // "user" or "admin"
});

const orderSchema = new mongoose.Schema({
  name: String,
  phone: String,
  email: String,
  address: String,
  item: Object,
});

const Product = mongoose.model("Product", productSchema);
const User = mongoose.model("User", userSchema);
const Order = mongoose.model("Order", orderSchema);

// ====== Routes ======

// Register Normal User
app.post("/api/register", async (req, res) => {
  try {
    const { email } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).send({ message: "Email already registered" });

    const user = new User({ ...req.body, role: "user" });
    await user.save();
    res.send({ message: "User registered" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Registration failed" });
  }
});

// ✅ Register Admin
app.post("/api/create-admin", async (req, res) => {
  try {
    const { email } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).send({ success: false, message: "Admin already exists" });

    const admin = new User({ ...req.body, role: "admin" });
    await admin.save();
    res.send({ success: true, message: "Admin created successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Failed to create admin" });
  }
});

// ✅ Unified Login (user or admin)
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).send({ success: false, message: "User not found" });
    if (user.password !== password) return res.status(401).send({ success: false, message: "Incorrect password" });

    res.send({ success: true, user });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Login error" });
  }
});

// Add Product (Cloudinary image upload)
app.post("/api/add-product", upload.single("image"), async (req, res) => {
  try {
    const { name, cost, store, stock, category, adminEmail, adminName ,city} = req.body;
    const { unit } = req.body;
    const image = req.file;

    if (!image) {
      return res.status(400).json({ success: false, message: "Image upload failed" });
    }

    const src = image.path;

    const product = new Product({ name, cost, store, stock, src, category, adminEmail, adminName,city, unit});
    await product.save();

    res.send({ success: true, message: "Product added successfully", product });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Failed to add product" });
  }
});

// Get Products by City
app.get("/api/products", async (req, res) => {
  const { city } = req.query;
  const products = await Product.find({ city });
  res.send(products);
});

// Book Order + Email Notifications
app.post("/api/book-order", async (req, res) => {
  try {
    const { name, phone, email, address, item } = req.body;

    const order = new Order({ name, phone, email, address, item });
    await order.save();

    const product = await Product.findById(item._id);
    if (!product) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "sailendrakondapalli@gmail.com",
        pass: "rhkghjcppsimmdfv",
      },
    });

    const userMail = {
      from: "sailendrakondapalli@gmail.com",
      to: email,
      subject: "✅ Order Confirmation",
      text: `Hi ${name},\n\nYour order for "${item.name}" has been placed.\n\nWe will deliver to:\n${address}\n\nThanks for shopping!`,
    };

    const adminMail = {
      from: "sailendrakondapalli@gmail.com",
      to: product.adminEmail,
      subject: "📦 New Order Received",
      text: `Hi ${product.adminName},\n\nYour product "${item.name}" has been ordered by:\n\nName: ${name}\nEmail: ${email}\nPhone: ${phone}\nAddress: ${address}\n\nPlease fulfill the order.`,
    };

    await transporter.sendMail(userMail);
    await transporter.sendMail(adminMail);

    res.send({ success: true, message: "Order placed and emails sent" });
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).send({ success: false, message: "Order failed" });
  }
});

// Search Orders by user name or email
app.get("/api/search-orders", async (req, res) => {
  try {
    const query = req.query.query;
    if (!query) return res.status(400).send({ message: "Search query is required" });

    const users = await User.find({
      $or: [
        { email: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } },
      ],
    });

    const emails = users.map((u) => u.email);
    const orders = await Order.find({ email: { $in: emails } }).sort({ createdAt: -1 });

    res.send({ orders });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: "Search failed" });
  }
});

// ====== Start Server ======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
