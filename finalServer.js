require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const base64 = require("base-64");
const app = express();
const PORT = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

app.use(express.json());
app.use(cors({
  origin: [
    "http://localhost:5173", // Keep for local development
    "http://www.petalperfect.com.s3-website-us-east-1.amazonaws.com" // Allow S3 bucket
  ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

let client, db;

async function connectToMongo() {
  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("IpItDataBase");
    console.log("Connected to MongoDB:", db.databaseName);
  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

// 10 possible profile pictures
const avatarChoices = [
  "https://4kwallpapers.com/images/walls/thumbs/23992.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/23893.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/23902.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/23991.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/5658.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/1679.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/14938.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/4289.jpg",
  "https://4kwallpapers.com/images/walls/thumbs_3t/4049.jpg",
  "https://4kwallpapers.com/images/walls/thumbs/2044.jpg"
];

// USERS
app.post("/signup", async (req, res) => {
  try {
    const user = req.body;
    if (!user.password || user.password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters" });
    if (!user.email || !user.email.includes("@"))
      return res.status(400).json({ message: "Invalid email format" });
    if (user.password !== user.confirmPassword)
      return res.status(400).json({ message: "Passwords do not match" });
    
    const existingUser = await db.collection("users").findOne({ email: user.email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }
    
    user.password = base64.encode(user.password);
    delete user.confirmPassword;
    user.avatar = avatarChoices[Math.floor(Math.random() * avatarChoices.length)];
    
    // Add default settings
    user.settings = {
      emailNotifications: true,
      smsNotifications: false,
      marketingEmails: true,
      orderUpdates: true,
      priceAlerts: false,
      defaultDeliveryTime: "morning",
      flowerPreferences: [],
      allergyInfo: "",
      autoReorder: false,
      wishlistPublic: false
    };
    
    const result = await db.collection("users").insertOne({
      ...user,
      createdAt: new Date(),
    });
    
    res.status(201).json({
      message: "User created",
      userId: result.insertedId,
      userName: user.userName || user.username,
      email: user.email,
      avatar: user.avatar,
      settings: user.settings
    });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/checkpassword", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }
    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const decodedPassword = base64.decode(user.password);
    if (password === decodedPassword) {
      return res.json({
        message: "Password is correct",
        valid: true,
        userName: user.userName || user.username,
        email: user.email,
        avatar: user.avatar,
        userId: user._id,
        phone: user.phone,
        address: user.address,
        settings: user.settings || {}
      });
    } else {
      return res.status(401).json({ message: "Invalid password", valid: false });
    }
  } catch (error) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/users", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email required" });
    const user = await db.collection("users").findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    
    let newFields = { ...req.body };
    if (newFields.password) newFields.password = base64.encode(newFields.password);
    
    // Add updatedAt timestamp
    newFields.updatedAt = new Date();
    
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(id) },
      { $set: newFields }
    );
    
    if (result.matchedCount === 0) return res.status(404).json({ message: "User not found" });
    
    // Return updated user data
    const updatedUser = await db.collection("users").findOne({ _id: new ObjectId(id) });
    res.json(updatedUser);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🔒 Password change endpoint
app.put("/users/:id/password", async (req, res) => {
  try {
    const { id } = req.params;
    const { email, currentPassword, newPassword } = req.body;
    
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new passwords are required" });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }
    
    // Verify current password
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    
    const decodedCurrentPassword = base64.decode(user.password);
    if (currentPassword !== decodedCurrentPassword) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }
    
    // Update password
    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          password: base64.encode(newPassword),
          lastPasswordChange: new Date(),
          updatedAt: new Date()
        }
      }
    );
    
    if (result.matchedCount === 0) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Password updated successfully" });
  } catch (e) {
    console.error("Password update error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 📊 Export user data (GDPR compliance)
app.get("/users/:id/export", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // Fetch all user-related data
    const [orders, cart, wishlist] = await Promise.all([
      db.collection("orders").find({ email: user.email }).toArray(),
      db.collection("carts").find({ email: user.email }).toArray(),
      db.collection("wishlist").find({ email: user.email }).toArray()
    ]);
    
    // Remove sensitive data
    const exportData = {
      profile: {
        userName: user.userName,
        email: user.email,
        phone: user.phone,
        address: user.address,
        avatar: user.avatar,
        createdAt: user.createdAt,
        settings: user.settings
      },
      orders: orders,
      cart: cart,
      wishlist: wishlist,
      exportDate: new Date(),
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum, order) => sum + (order.total || 0), 0)
    };
    
    res.json(exportData);
  } catch (e) {
    console.error("Export error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// 🗑️ Delete user account (with all related data)
app.delete("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;
    
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    if (!email) return res.status(400).json({ message: "Email confirmation required" });
    
    // Verify user exists and email matches
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email !== email) {
      return res.status(403).json({ message: "Email doesn't match user account" });
    }
    
    // Delete all user-related data
    await Promise.all([
      db.collection("users").deleteOne({ _id: new ObjectId(id) }),
      db.collection("orders").deleteMany({ email: email }),
      db.collection("carts").deleteMany({ email: email }),
      db.collection("wishlist").deleteMany({ email: email })
    ]);
    
    res.json({ message: "User account and all associated data deleted successfully" });
  } catch (e) {
    console.error("Account deletion error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// CARTS
app.post("/carts", async (req, res) => {
  try {
    const cart = req.body;
    delete cart._id;
    const result = await db.collection("carts").insertOne({ ...cart, createdAt: new Date() });
    res.status(201).json({ message: "Cart item added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/cart/clear", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    await db.collection("carts").deleteMany({ email });
    res.json({ message: "Cart cleared" });
  } catch (e) {
    res.status(500).json({ message: "Error clearing cart" });
  }
});

app.get("/carts", async (req, res) => {
  try {
    if (!req.query.email) return res.status(400).json({ message: "Email required" });
    const carts = await db.collection("carts").find({ email: req.query.email }).toArray();
    res.json(carts);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/carts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const cart = await db.collection("carts").findOne({ _id: new ObjectId(id) });
    if (!cart) return res.status(404).json({ message: "Cart item not found" });
    res.json(cart);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/carts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("carts").updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: "Cart item not found" });
    res.json({ message: "Cart item updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/carts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("carts").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Cart item not found" });
    res.json({ message: "Cart item deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// ORDERS
app.post("/orders", async (req, res) => {
  try {
    const order = req.body;
    // Add default status if not provided
    if (!order.status) order.status = "Placed";
    
    const result = await db.collection("orders").insertOne({ 
      ...order, 
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    // Clear user's cart after successful order
    if (order.email) {
      await db.collection("carts").deleteMany({ email: order.email });
    }
    
    res.status(201).json({ message: "Order placed successfully", id: result.insertedId });
  } catch (e) {
    console.error("Order creation error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/orders", async (req, res) => {
  try {
    if (!req.query.email) return res.status(400).json({ message: "Email required" });
    const orders = await db.collection("orders")
      .find({ email: req.query.email })
      .sort({ createdAt: -1 }) // Most recent first
      .toArray();
    res.json(orders);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// Get user statistics
app.get("/users/:id/stats", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid user ID" });
    
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    
    const orders = await db.collection("orders").find({ email: user.email }).toArray();
    const wishlist = await db.collection("wishlist").find({ email: user.email }).toArray();
    const cart = await db.collection("carts").find({ email: user.email }).toArray();
    
    const totalSpent = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = orders.length;
    
    // Calculate favorite category
    const categoryCount = orders.flatMap(o => o.cart || [])
      .reduce((acc, item) => {
        acc[item.category] = (acc[item.category] || 0) + 1;
        return acc;
      }, {});
    
    const favoriteCategory = Object.keys(categoryCount).reduce((a, b) => 
      categoryCount[a] > categoryCount[b] ? a : b, "None"
    );
    
    res.json({
      totalOrders,
      totalSpent,
      wishlistCount: wishlist.length,
      cartCount: cart.length,
      favoriteCategory,
      memberSince: user.createdAt,
      lastLogin: user.lastLogin || user.createdAt
    });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// WISHLIST ENDPOINTS
app.post("/wishlist", async (req, res) => {
  try {
    const { email, ...rest } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });
    
    // Check if item already in wishlist
    const existing = await db.collection("wishlist").findOne({ 
      email, 
      title: rest.title 
    });
    
    if (existing) {
      return res.status(400).json({ message: "Item already in wishlist" });
    }
    
    const result = await db.collection("wishlist").insertOne({ 
      email, 
      ...rest, 
      createdAt: new Date() 
    });
    
    res.status(201).json({ message: "Wishlist item added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/wishlist", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: "Email required" });
    const items = await db.collection("wishlist")
      .find({ email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(items);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/wishlist/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("wishlist").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Wishlist item not found" });
    res.json({ message: "Wishlist item deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// PAYMENTS
app.post("/payments", async (req, res) => {
  try {
    const payment = req.body;
    const result = await db.collection("payments").insertOne({ ...payment, createdAt: new Date() });
    res.status(201).json({ message: "Payment added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/payments", async (req, res) => {
  try {
    const payments = await db.collection("payments").find().toArray();
    res.json(payments);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const payment = await db.collection("payments").findOne({ _id: new ObjectId(id) });
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.json(payment);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("payments").updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/payments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("payments").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// PRODUCTS 
app.post("/products", async (req, res) => {
  try {
    const product = req.body;
    // Add default values for ecommerce features
    if (!product.rating) product.rating = 4.0 + Math.random() * 1; // Random rating 4.0-5.0
    if (!product.reviewCount) product.reviewCount = Math.floor(Math.random() * 50) + 5;
    if (!product.stock) product.stock = Math.floor(Math.random() * 20) + 1;
    
    const result = await db.collection("products").insertOne({ 
      ...product, 
      createdAt: new Date() 
    });
    res.status(201).json({ message: "Product added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const products = await db.collection("products").find().toArray();
    res.json(products);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const product = await db.collection("products").findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("products").updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...req.body, updatedAt: new Date() } }
    );
    if (result.matchedCount === 0) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

connectToMongo().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});