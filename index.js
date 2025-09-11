require("dotenv").config();
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const base64 = require("base-64");

const app = express();
const PORT = process.env.PORT || 3000;

const uri = process.env.MONGODB_URI;

app.use(express.json());

let client, db;

async function connectToMongo() {
  try {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db("IpItDataBase");
    console.log("Connected to MongoDB:", db.databaseName);
  } catch (error) {
    console.error(" MongoDB connection failed:", error);
    process.exit(1);
  }
}

// =========================
// AUTH MIDDLEWARE
// =========================
function authMiddleware(req, res, next) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res
      .status(401)
      .json({ message: "Missing or invalid Authorization header" });
  }

  const base64Creds = authHeader.split(" ")[1];
  const [email, password] = Buffer.from(base64Creds, "base64")
    .toString("utf8")
    .split(":");

  db.collection("users").findOne({ email }, (err, user) => {
    if (err) {
      console.error("Error finding user:", err);
      return res.status(500).json({ message: "Internal Server Error" });
    }
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const storedPassword = base64.decode(user.password);
    if (storedPassword !== password) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    req.user = user;
    next();
  })
  console.log("Decoded:", email, password);;
}

// =========================
// USERS
// =========================
app.post("/signup", async (req, res) => {
  try {
    const user = req.body;

    if (!user.password || user.password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }
    if (!user.email || !user.email.includes("@")) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (user.password !== user.confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    delete user.confirmPassword;

    user.password = base64.encode(user.password);

    const result = await db
      .collection("users")
      .insertOne({ ...user, createdAt: new Date() });
    res
      .status(201)
      .json({ message: "User created", userId: result.insertedId });
  } catch (e) {
    console.error("Error inserting user:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.post("/checkpassword", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await db.collection("users").findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const decodedPassword = base64.decode(user.password);
    if (password === decodedPassword) {
      return res.json({ message: "Password is correct", valid: true });
    } else {
      return res
        .status(401)
        .json({ message: "Invalid password", valid: false });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/users/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user ID" });
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/users/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user ID" });
    const result = await db
      .collection("users")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "User not found" });
    res.json({ message: "User updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/users/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid user ID" });
    const result = await db.collection("users").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "User not found" });
    res.json({ message: "User deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// USERLOCATION
// =========================
app.post("/userlocation", authMiddleware, async (req, res) => {
  try {
    const { email, locationId } = req.body;

    if (!email || !locationId) {
      return res
        .status(400)
        .json({ message: "Email and locationId required" });
    }
    const result = await db
      .collection("userlocation")
      .insertOne({ email, locationId, createdAt: new Date() });
    res
      .status(201)
      .json({ message: "Location added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/userlocation", authMiddleware, async (req, res) => {
  try {
    const locations = await db.collection("userlocation").find().toArray();
    res.json(locations);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/userlocation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const loc = await db
      .collection("userlocation")
      .findOne({ _id: new ObjectId(id) });
    if (!loc) return res.status(404).json({ message: "Location not found" });
    res.json(loc);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/userlocation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("userlocation")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Location not found" });
    res.json({ message: "Location updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/userlocation/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("userlocation")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Location not found" });
    res.json({ message: "Location deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// REVIEWS
// =========================
app.post("/reviews", authMiddleware, async (req, res) => {
  try {
    const review = req.body;
    const result = await db
      .collection("reviews")
      .insertOne({ ...review, createdAt: new Date() });
    res.status(201).json({ message: "Review added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/reviews", authMiddleware, async (req, res) => {
  try {
    const reviews = await db.collection("reviews").find().toArray();
    res.json(reviews);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/reviews/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const review = await db.collection("reviews").findOne({ _id: new ObjectId(id) });
    if (!review) return res.status(404).json({ message: "Review not found" });
    res.json(review);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/reviews/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("reviews")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Review not found" });
    res.json({ message: "Review updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/reviews/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("reviews")
      .deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Review not found" });
    res.json({ message: "Review deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// PRODUCTS
// =========================
app.post("/products", authMiddleware, async (req, res) => {
  try {
    const product = req.body;
    const result = await db
      .collection("products")
      .insertOne({ ...product, createdAt: new Date() });
    res.status(201).json({ message: "Product added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/products", authMiddleware, async (req, res) => {
  try {
    const products = await db.collection("products").find().toArray();
    res.json(products);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/products/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const product = await db.collection("products").findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/products/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("products")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/products/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("products").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// PAYMENTS
// =========================
app.post("/payments", authMiddleware, async (req, res) => {
  try {
    const payment = req.body;
    const result = await db
      .collection("payments")
      .insertOne({ ...payment, createdAt: new Date() });
    res.status(201).json({ message: "Payment added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/payments", authMiddleware, async (req, res) => {
  try {
    const payments = await db.collection("payments").find().toArray();
    res.json(payments);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/payments/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const payment = await db.collection("payments").findOne({ _id: new ObjectId(id) });
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    res.json(payment);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/payments/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("payments")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/payments/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("payments").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Payment not found" });
    res.json({ message: "Payment deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// CARTS
// =========================
app.post("/carts", authMiddleware, async (req, res) => {
  try {
    const cart = req.body;
    const result = await db
      .collection("carts")
      .insertOne({ ...cart, createdAt: new Date() });
    res.status(201).json({ message: "Cart item added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/carts", authMiddleware, async (req, res) => {
  try {
    const carts = await db.collection("carts").find().toArray();
    res.json(carts);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/carts/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const cart = await db.collection("carts").findOne({ _id: new ObjectId(id) });
    if (!cart) return res.status(404).json({ message: "Cart item not found" });
    res.json(cart);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/carts/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("carts")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Cart item not found" });
    res.json({ message: "Cart item updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/carts/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("carts").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Cart item not found" });
    res.json({ message: "Cart item deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// ORDERS
// =========================
app.post("/orders", authMiddleware, async (req, res) => {
  try {
    const order = req.body;
    const result = await db
      .collection("orders")
      .insertOne({ ...order, createdAt: new Date() });
    res.status(201).json({ message: "Order added", id: result.insertedId });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/orders", authMiddleware, async (req, res) => {
  try {
    const orders = await db.collection("orders").find().toArray();
    res.json(orders);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.get("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const order = await db.collection("orders").findOne({ _id: new ObjectId(id) });
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.put("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db
      .collection("orders")
      .updateOne({ _id: new ObjectId(id) }, { $set: req.body });
    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Order not found" });
    res.json({ message: "Order updated" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

app.delete("/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });
    const result = await db.collection("orders").deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Order not found" });
    res.json({ message: "Order deleted" });
  } catch (e) {
    res.status(500).json({ message: "Internal Server Error" });
  }
});

// =========================
// START SERVER
// =========================
connectToMongo().then(() => {
  app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
  );
});
